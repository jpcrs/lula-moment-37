import AppKit
import Carbon
import CoreGraphics
import Darwin

// This tool only posts macOS keyboard events. It never reads or calls the game's JavaScript.
struct Finish: Codable {
    let jump_hk, crouch_mk, shoryuken_motion, shoryuken, super_motion, shippu: Int
    let expected_hits: [Int]
    let expected_combo_hits: Int
}

struct Fixture: Decodable {
    let fps: Double
    let inputs: [String: Int]
    let finish: Finish
}

struct GameKey: Sendable, Encodable {
    let mask: Int
    let code: CGKeyCode
    let name: String
}

let gameKeys: [GameKey] = [
    .init(mask: 1, code: 126, name: "Up"), .init(mask: 2, code: 125, name: "Down"),
    .init(mask: 4, code: 123, name: "Left"), .init(mask: 8, code: 124, name: "Right"),
    .init(mask: 16, code: 6, name: "Z"), .init(mask: 32, code: 7, name: "X"),
    .init(mask: 64, code: 8, name: "C"), .init(mask: 256, code: 0, name: "A"),
    .init(mask: 512, code: 1, name: "S"), .init(mask: 1024, code: 2, name: "D")
]
let retryKey = GameKey(mask: 0, code: 15, name: "R")

struct PlannedKey: Sendable, Encodable {
    let nanoseconds: UInt64
    let frame: Int
    let key: GameKey
    let down: Bool
}

func fixtureURL() -> URL {
    let executable = URL(fileURLWithPath: CommandLine.arguments[0]).standardizedFileURL
    return executable.deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("Resources/sequence.json")
}

func loadFixture() throws -> Fixture {
    try JSONDecoder().decode(Fixture.self, from: Data(contentsOf: fixtureURL()))
}

func makePlan(_ fixture: Fixture, offsetMS: Double = 0) throws -> [PlannedKey] {
    guard abs(fixture.fps - 60000 / 1001) < 0.000001,
          fixture.inputs.keys.allSatisfy({ (Int($0) ?? -1) >= 0 }),
          fixture.inputs.values.allSatisfy({ $0 >= 0 && $0 & ~gameKeys.reduce(0, { $0 | $1.mask }) == 0 }) else {
        throw NSError(domain: "Evo37Macro", code: 1, userInfo: [NSLocalizedDescriptionKey: "Invalid replay fixture or frame rate."])
    }
    let finish = fixture.finish
    let stages = [finish.jump_hk, finish.crouch_mk, finish.shoryuken_motion, finish.shoryuken, finish.super_motion, finish.shippu]
    guard stages.first! >= 0, zip(stages, stages.dropFirst()).allSatisfy({ $0 < $1 }),
          fixture.inputs[String(finish.jump_hk)] == 1024,
          fixture.inputs[String(finish.crouch_mk)] == 514,
          fixture.inputs[String(finish.shoryuken_motion)] == 4,
          fixture.inputs[String(finish.shoryuken)] == 38,
          fixture.inputs[String(finish.super_motion)] == 2,
          fixture.inputs[String(finish.shippu)] == 260,
          finish.expected_combo_hits == 12, finish.expected_hits.count == 12,
          finish.expected_hits[2] >= finish.shoryuken, finish.expected_hits[2] < finish.shippu else {
        throw NSError(domain: "Evo37Macro", code: 2, userInfo: [NSLocalizedDescriptionKey: "The replay must contain jumping HK, crouching MK, and medium Shoryuken canceled on its first hit into Shippu. Run the launcher to refresh its sequence."])
    }
    var plan = [PlannedKey(nanoseconds: 0, frame: -1, key: retryKey, down: true),
                PlannedKey(nanoseconds: 6_000_000, frame: -1, key: retryKey, down: false)]
    let last = fixture.inputs.keys.compactMap(Int.init).max() ?? 0
    var previous = 0
    for frame in 0...last + 1 {
        let bits = fixture.inputs[String(frame)] ?? 0
        if bits == previous { continue }
        // Tick f is sampled at (f+1)/fps. Change buttons halfway between sample points.
        let at = UInt64(((Double(frame) + 0.5) / fixture.fps * 1e9 + offsetMS * 1e6).rounded())
        for key in gameKeys where previous & key.mask != 0 && bits & key.mask == 0 {
            plan.append(.init(nanoseconds: at, frame: frame, key: key, down: false))
        }
        for key in gameKeys where previous & key.mask == 0 && bits & key.mask != 0 {
            plan.append(.init(nanoseconds: at, frame: frame, key: key, down: true))
        }
        previous = bits
    }
    return plan
}

struct MonotonicClock {
    private let ratio: Double
    init() {
        var info = mach_timebase_info_data_t()
        mach_timebase_info(&info)
        ratio = Double(info.numer) / Double(info.denom)
    }
    var now: UInt64 { mach_absolute_time() }
    func ticks(_ ns: UInt64) -> UInt64 { UInt64((Double(ns) / ratio).rounded()) }
    func milliseconds(_ ticks: UInt64) -> Double { Double(ticks) * ratio / 1e6 }
    func wait(until deadline: UInt64, cancelled: () -> Bool = { false }) throws {
        // macOS can coalesce a short sleep by several milliseconds. Wake early
        // and finish the deadline with a short spin, including the tight cancel.
        let tail = ticks(3_000_000)
        while now < deadline {
            if cancelled() { throw ReplayError.cancelled }
            let time = now
            if deadline > time + tail {
                // Short sleep chunks allow stopping promptly between widely spaced kicks.
                mach_wait_until(min(deadline - tail, time + ticks(10_000_000)))
            }
        }
    }
}

enum ReplayError: Error, LocalizedError {
    case cancelled, modifiersHeld, late(Double), noEvent
    var errorDescription: String? {
        switch self {
        case .cancelled: return "Replay stopped."
        case .modifiersHeld: return "Release Control, Option, Command and Shift, then retry."
        case .late(let ms): return String(format: "macOS interrupted the timing (%.2f ms late). Try again.", ms)
        case .noEvent: return "macOS could not create a keyboard event."
        }
    }
}

final class ReplaySession: @unchecked Sendable {
    let pid: pid_t
    private let lock = NSLock()
    private var stopped = false
    init(pid: pid_t) { self.pid = pid }
    func cancel() { lock.lock(); stopped = true; lock.unlock() }
    var cancelled: Bool { lock.lock(); defer { lock.unlock() }; return stopped }
}

func replay(_ plan: [PlannedKey], session: ReplaySession) throws -> Double {
    let clock = MonotonicClock()
    let source = CGEventSource(stateID: .privateState)
    source?.localEventsSuppressionInterval = 0
    var prepared: [(PlannedKey, CGEvent)] = []
    for key in plan {
        guard let event = CGEvent(keyboardEventSource: source, virtualKey: key.key.code, keyDown: key.down) else { throw ReplayError.noEvent }
        event.flags = []
        event.setIntegerValueField(.keyboardEventAutorepeat, value: 0)
        prepared.append((key, event))
    }
    var held = Set<CGKeyCode>()
    defer {
        // Also release keys on cancellation, focus loss, scheduling errors and Quit.
        for code in held {
            if let event = CGEvent(keyboardEventSource: source, virtualKey: code, keyDown: false) {
                event.flags = []; event.postToPid(session.pid)
            }
        }
    }
    let releaseDeadline = clock.now + clock.ticks(3_000_000_000)
    let modifiers: CGEventFlags = [.maskCommand, .maskControl, .maskAlternate, .maskShift]
    while !CGEventSource.flagsState(.combinedSessionState).intersection(modifiers).isEmpty {
        if clock.now >= releaseDeadline { throw ReplayError.modifiersHeld }
        try clock.wait(until: clock.now + clock.ticks(10_000_000), cancelled: { session.cancelled })
    }
    // Let the shortcut/menu close before delivering R to the focused game.
    try clock.wait(until: clock.now + clock.ticks(500_000_000), cancelled: { session.cancelled })
    let origin = clock.now
    var worst = 0.0
    for (key, event) in prepared {
        let deadline = origin + clock.ticks(key.nanoseconds)
        try clock.wait(until: deadline, cancelled: { session.cancelled })
        if session.cancelled { throw ReplayError.cancelled }
        let late = clock.milliseconds(clock.now - deadline)
        worst = max(worst, late)
        // Do not silently send a burst of overdue input and claim it was on time.
        if late > 3 { throw ReplayError.late(late) }
        event.timestamp = clock_gettime_nsec_np(CLOCK_UPTIME_RAW)
        event.postToPid(session.pid)
        if key.down { held.insert(key.key.code) } else { held.remove(key.key.code) }
    }
    return worst
}

func axAttribute(_ element: AXUIElement, _ name: String) -> CFTypeRef? {
    var result: CFTypeRef?
    return AXUIElementCopyAttributeValue(element, name as CFString, &result) == .success ? result : nil
}

func isReplayBrowser(_ bundleID: String?) -> Bool {
    guard let id = bundleID?.lowercased() else { return false }
    return ["com.google.chrome", "com.microsoft.edgemac", "com.brave.browser", "com.apple.safari", "org.mozilla.firefox", "com.vivaldi.vivaldi", "com.kagi.kagimacos", "company.thebrowser.browser"].contains { id == $0 || id.hasPrefix($0 + ".") }
}

func permitsReplayTarget(bundleID: String?, focusedRole: String?, gameMetadata: Bool) -> Bool {
    // Posting permission does not guarantee that an app exposes a focused AX element.
    // The user chooses the game tab; known browsers do not need page-title detection.
    let editingRoles = ["AXTextField", "AXTextArea", "AXComboBox", "AXSlider"]
    if let role = focusedRole, editingRoles.contains(role) { return false }
    return isReplayBrowser(bundleID) || gameMetadata
}

func hasGameTitle(_ title: String) -> Bool {
    ["Lula Moment #37", "Evo Moment #37", "The Daigo Challenge"].contains { title.localizedCaseInsensitiveContains($0) }
}

func hasGameURL(_ value: String) -> Bool {
    guard let url = URL(string: value), let host = url.host?.lowercased() else { return false }
    if ["localhost", "127.0.0.1"].contains(host) { return [3737, 3749].contains(url.port ?? 0) }
    return host == "jpcrs.github.io" && ["/lula-moment-37", "/evo-moment-37"].contains { url.path == $0 || url.path.hasPrefix($0 + "/") }
}

func targetIsGame(_ application: NSRunningApplication) -> Bool {
    let app = AXUIElementCreateApplication(application.processIdentifier)
    let rawFocused = axAttribute(app, kAXFocusedUIElementAttribute)
    var element: AXUIElement?
    if let raw = rawFocused, CFGetTypeID(raw) == AXUIElementGetTypeID() { element = (raw as! AXUIElement) }
    let role = element.flatMap { axAttribute($0, kAXRoleAttribute) as? String }
    if isReplayBrowser(application.bundleIdentifier) {
        return permitsReplayTarget(bundleID: application.bundleIdentifier, focusedRole: role, gameMetadata: false)
    }
    // Inspect native accessibility metadata, never the page's JavaScript or engine state.
    for _ in 0..<18 {
        guard let current = element else { break }
        if let title = axAttribute(current, kAXTitleAttribute) as? String, hasGameTitle(title) {
            return permitsReplayTarget(bundleID: application.bundleIdentifier, focusedRole: role, gameMetadata: true)
        }
        if let raw = axAttribute(current, kAXURLAttribute) {
            let url = (raw as? String) ?? (raw as? URL)?.absoluteString ?? ""
            if hasGameURL(url) {
                return permitsReplayTarget(bundleID: application.bundleIdentifier, focusedRole: role, gameMetadata: true)
            }
        }
        guard let parent = axAttribute(current, kAXParentAttribute), CFGetTypeID(parent) == AXUIElementGetTypeID() else { break }
        element = (parent as! AXUIElement)
    }
    if let window = axAttribute(app, kAXFocusedWindowAttribute), CFGetTypeID(window) == AXUIElementGetTypeID(),
       let title = axAttribute(window as! AXUIElement, kAXTitleAttribute) as? String {
        return permitsReplayTarget(bundleID: application.bundleIdentifier, focusedRole: role, gameMetadata: hasGameTitle(title))
    }
    return false
}

@MainActor final class MacroApp: NSObject, NSApplicationDelegate {
    private var status: NSStatusItem!
    private var runItem: NSMenuItem!
    private var stopItem: NSMenuItem!
    private var infoItem: NSMenuItem!
    private var offsetItems: [NSMenuItem] = []
    private var hotKeys: [EventHotKeyRef] = []
    private var escapeHotKey: EventHotKeyRef?
    private var handler: EventHandlerRef?
    private var session: ReplaySession?
    private var offsetMS = 0.0
    private var quitting = false
    private var activationObserver: NSObjectProtocol?
    private let checkingUI = CommandLine.arguments.contains("--ui-check")
    private var startupError = false

    func applicationDidFinishLaunching(_ notification: Notification) {
        status = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        status.button?.title = "37"
        let menu = NSMenu()
        infoItem = NSMenuItem(title: "Lula Moment #37 · MP Shoryuken → Shippu · 59.94 Hz", action: nil, keyEquivalent: "")
        menu.addItem(infoItem)
        runItem = item("Replay  —  ⌃⌥⌘P", #selector(startReplay)); menu.addItem(runItem)
        stopItem = item("Stop  —  Esc / ⌃⌥⌘X", #selector(stopReplay)); stopItem.isEnabled = false; menu.addItem(stopItem)
        let timing = NSMenuItem(title: "Input alignment", action: nil, keyEquivalent: "")
        timing.submenu = NSMenu()
        for value in stride(from: -16, through: 16, by: 4) {
            let choice = item(value == 0 ? "Default (0 ms)" : String(format: "%+d ms", value), #selector(changeOffset(_:)))
            choice.tag = value; choice.state = value == 0 ? .on : .off; timing.submenu?.addItem(choice); offsetItems.append(choice)
        }
        menu.addItem(timing); menu.addItem(.separator())
        menu.addItem(item("Enable keyboard permission…", #selector(permission)))
        menu.addItem(item("How to use…", #selector(instructions)))
        menu.addItem(item("Quit", #selector(quit)))
        status.menu = menu
        installHotKeys()
        activationObserver = NSWorkspace.shared.notificationCenter.addObserver(forName: NSWorkspace.didActivateApplicationNotification, object: nil, queue: .main) { [weak self] note in
            guard let active = note.userInfo?[NSWorkspace.applicationUserInfoKey] as? NSRunningApplication else { return }
            let pid = active.processIdentifier
            DispatchQueue.main.async {
                if let session = self?.session, pid != session.pid { session.cancel() }
            }
        }
        if checkingUI {
            guard !startupError, hotKeys.count == 2, status.button != nil else { exit(1) }
            var testEscape: EventHotKeyRef?
            let result = RegisterEventHotKey(53, 0, EventHotKeyID(signature: 0x45564F33, id: 3), GetApplicationEventTarget(), 0, &testEscape)
            if let reference = testEscape { UnregisterEventHotKey(reference) }
            guard result == noErr else { fputs("Escape stop registration failed: \(result)\n", stderr); exit(1) }
            print("Menu-bar UI and all three shortcuts initialized; no keys posted or permissions requested.")
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.2) { NSApp.terminate(nil) }
        }
    }
    private func item(_ title: String, _ action: Selector) -> NSMenuItem {
        let value = NSMenuItem(title: title, action: action, keyEquivalent: ""); value.target = self; return value
    }
    private func installHotKeys() {
        var spec = EventTypeSpec(eventClass: OSType(kEventClassKeyboard), eventKind: UInt32(kEventHotKeyPressed))
        let result = InstallEventHandler(GetApplicationEventTarget(), { _, event, pointer in
            guard let event = event, let pointer = pointer else { return OSStatus(eventNotHandledErr) }
            var key = EventHotKeyID()
            let result = GetEventParameter(event, EventParamName(kEventParamDirectObject), EventParamType(typeEventHotKeyID), nil, MemoryLayout<EventHotKeyID>.size, nil, &key)
            if result == noErr {
                let id = key.id
                DispatchQueue.main.async {
                    let owner = Unmanaged<MacroApp>.fromOpaque(pointer).takeUnretainedValue()
                    if id == 1 { owner.startReplay() } else { owner.stopReplay() }
                }
            }
            return result
        }, 1, &spec, Unmanaged.passUnretained(self).toOpaque(), &handler)
        guard result == noErr else { show("Could not register the replay shortcuts."); return }
        for (code, id) in [(UInt32(35), UInt32(1)), (UInt32(7), UInt32(2))] {
            var reference: EventHotKeyRef?
            let result = RegisterEventHotKey(code, UInt32(controlKey | optionKey | cmdKey), EventHotKeyID(signature: 0x45564F33, id: id), GetApplicationEventTarget(), 0, &reference)
            if result == noErr, let reference = reference { hotKeys.append(reference) }
            else { show("A replay shortcut is already used by another app. Use the 37 menu instead.") }
        }
    }
    @objc func startReplay() {
        if checkingUI { return }
        guard session == nil else { return }
        guard CGPreflightPostEventAccess() else { permission(); return }
        guard let target = NSWorkspace.shared.frontmostApplication, targetIsGame(target) else {
            show("Use Chrome or Edge with the game tab selected. Click the fighting area, close Help, then press Control + Option + Command + P. Avoid the address bar and volume sliders."); return
        }
        do {
            // Reload the bundled sequence for every attempt, including when the
            // launcher refreshed it while this menu-bar process stayed open.
            let plan = try makePlan(loadFixture(), offsetMS: offsetMS)
            let active = ReplaySession(pid: target.processIdentifier); session = active
            status.button?.title = "37 ▶"; runItem.isEnabled = false; stopItem.isEnabled = true
            infoItem.title = "Release the shortcut keys · replay starts shortly"
            // Escape is reserved only while a replay is active.
            var escape: EventHotKeyRef?
            if RegisterEventHotKey(53, 0, EventHotKeyID(signature: 0x45564F33, id: 3), GetApplicationEventTarget(), 0, &escape) == noErr { escapeHotKey = escape }
            DispatchQueue.global(qos: .userInteractive).async { [weak self] in
                let result: Result<Double, Error>
                do { result = .success(try replay(plan, session: active)) } catch { result = .failure(error) }
                DispatchQueue.main.async { self?.finished(result) }
            }
        } catch { show(error.localizedDescription) }
    }
    private func finished(_ result: Result<Double, Error>) {
        session = nil; status.button?.title = "37"; runItem.isEnabled = true; stopItem.isEnabled = false
        if let escape = escapeHotKey { UnregisterEventHotKey(escape); escapeHotKey = nil }
        switch result {
        case .success(let ms): infoItem.title = String(format: "Inputs sent · maximum posting lateness %.2f ms", ms)
        case .failure(let error): infoItem.title = error.localizedDescription
        }
        if quitting { NSApp.reply(toApplicationShouldTerminate: true) }
    }
    @objc func stopReplay() { session?.cancel() }
    @objc private func changeOffset(_ sender: NSMenuItem) {
        guard session == nil else { return }; offsetMS = Double(sender.tag)
        for item in offsetItems { item.state = item === sender ? .on : .off }
    }
    @objc private func permission() {
        _ = CGRequestPostEventAccess()
        if !CGPreflightPostEventAccess() {
            NSWorkspace.shared.open(URL(string: "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility")!)
            show("Allow Evo 37 Macro in System Settings → Privacy & Security → Accessibility. Then return to the game and use the replay shortcut.")
        }
    }
    @objc private func instructions() {
        show("1. Open Lula Moment #37 and click Jogar once to load the audio. Let that attempt finish.\n2. Close Ajuda, click the fighting area and release all game buttons.\n3. Press Control + Option + Command + P, then release the shortcut. The macro presses R and plays fifteen parries, jumping HK, crouching MK, medium Shoryuken and a first-hit cancel into Shippu.\n\nEsc or Control + Option + Command + X stops the replay. If inputs land a frame early or late, adjust Input alignment in this menu. The OS schedule is precise; macOS/browser delivery is not guaranteed to be frame-perfect.")
    }
    private func show(_ text: String) {
        if checkingUI { startupError = true; fputs("\(text)\n", stderr); return }
        let alert = NSAlert(); alert.messageText = "Evo 37 Macro"; alert.informativeText = text; alert.addButton(withTitle: "OK"); alert.runModal()
    }
    @objc private func quit() { NSApp.terminate(nil) }
    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        if let session = session { quitting = true; session.cancel(); return .terminateLater }
        return .terminateNow
    }
}

func selfTest(_ fixture: Fixture) throws {
    precondition(hasGameTitle("Lula Moment #37"))
    precondition(hasGameURL("http://localhost:3749/"))
    precondition(hasGameURL("http://127.0.0.1:3737/"))
    precondition(hasGameURL("https://jpcrs.github.io/lula-moment-37/"))
    precondition(!hasGameURL("https://example.com/localhost:3749"))
    precondition(permitsReplayTarget(bundleID: "com.google.Chrome", focusedRole: nil, gameMetadata: false))
    precondition(permitsReplayTarget(bundleID: "com.microsoft.edgemac", focusedRole: "AXWebArea", gameMetadata: false))
    precondition(!permitsReplayTarget(bundleID: "com.google.Chrome", focusedRole: "AXTextField", gameMetadata: true))
    precondition(!permitsReplayTarget(bundleID: "com.microsoft.edgemac", focusedRole: "AXSlider", gameMetadata: true))
    precondition(!permitsReplayTarget(bundleID: "com.apple.Terminal", focusedRole: nil, gameMetadata: false))
    let plan = try makePlan(fixture)
    var held = 0, cursor = 2
    let last = fixture.inputs.keys.compactMap(Int.init).max() ?? 0
    for frame in 0...last + 1 {
        let sample = UInt64((Double(frame + 1) / fixture.fps * 1e9).rounded())
        while cursor < plan.count && plan[cursor].nanoseconds <= sample {
            let event = plan[cursor]
            held = event.down ? held | event.key.mask : held & ~event.key.mask; cursor += 1
        }
        guard held == (fixture.inputs[String(frame)] ?? 0) else { fatalError("Replay mismatch at frame \(frame)") }
    }
    guard held == 0, cursor == plan.count else { fatalError("Replay leaves a key held") }
    for offset in stride(from: -16.0, through: 16.0, by: 4) {
        let adjusted = try makePlan(fixture, offsetMS: offset)
        guard adjusted.count == plan.count, zip(adjusted, adjusted.dropFirst()).allSatisfy({ $0.nanoseconds <= $1.nanoseconds }) else { fatalError("Invalid alignment option") }
    }
    print("Verified browser focus fallback, \(last + 2) input frames, \(plan.count) key events, \(fixture.fps) Hz; every key is released. Finish: jumping HK → crouching MK → MP Shoryuken → first-hit Shippu cancel (12 hits).")
}

do {
    let fixture = try loadFixture()
    if CommandLine.arguments.contains("--self-test") { try selfTest(fixture) }
    else if CommandLine.arguments.contains("--export-plan") {
        struct Export: Encodable { let fps: Double; let finish: Finish; let events: [PlannedKey] }
        let value = Export(fps: fixture.fps, finish: fixture.finish, events: try makePlan(fixture))
        let encoder = JSONEncoder(); encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        print(String(decoding: try encoder.encode(value), as: UTF8.self))
    }
    else if CommandLine.arguments.contains("--dry-run") {
        try selfTest(fixture)
        for event in try makePlan(fixture) { print(String(format: "%9.3f ms  frame %3d  %@ %@", Double(event.nanoseconds) / 1e6, event.frame, event.key.name, event.down ? "down" : "up")) }
    } else if CommandLine.arguments.contains("--timing-test") {
        let plan = try makePlan(fixture), completion = DispatchSemaphore(value: 0)
        // Use the replay's actual queue priority, rather than benchmarking a
        // lower-priority command-line thread with different timer coalescing.
        DispatchQueue.global(qos: .userInteractive).async {
            let clock = MonotonicClock(), origin = clock.now + clock.ticks(100_000_000)
            var lateness: [Double] = []
            for event in plan {
                let deadline = origin + clock.ticks(event.nanoseconds)
                do { try clock.wait(until: deadline) } catch { fputs("\(error.localizedDescription)\n", stderr); exit(1) }
                lateness.append(clock.milliseconds(clock.now - deadline))
            }
            let sorted = lateness.sorted(), missed = lateness.filter { $0 > 3 }.count
            print(String(format: "Replay scheduler only; no keys posted. %d deadlines. Median %.3f ms, p95 %.3f ms, max %.3f ms late; %d exceed the 3 ms replay limit.", sorted.count, sorted[sorted.count / 2], sorted[Int(Double(sorted.count - 1) * 0.95)], sorted.last!, missed))
            if missed > 0 { exit(1) }
            completion.signal()
        }
        completion.wait()
    } else {
        MainActor.assumeIsolated {
            let app = NSApplication.shared; app.setActivationPolicy(.accessory)
            let owner = MacroApp(); app.delegate = owner
            withExtendedLifetime(owner) { app.run() }
        }
    }
} catch { fputs("Evo 37 Macro: \(error.localizedDescription)\n", stderr); exit(1) }
