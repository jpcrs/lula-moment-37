# Evo 37 macOS macro

This is an external macOS keyboard macro. It posts real Quartz keyboard events to the focused game's application. It does not inject JavaScript, call WebAssembly exports, read game state, or change the website.

1. Double-click **Run Evo 37 Macro.command**. The compiled app appears as **37** in the menu bar. Xcode Command Line Tools are needed for the first build; they are already installed on this computer.
2. Use **37 → Enable keyboard permission…** and allow **Evo 37 Macro** under **System Settings → Privacy & Security → Accessibility**. This permission is required by macOS to post keyboard events. Input Monitoring is not needed; the shortcuts use Carbon's registered hotkey API.
3. Open **Lula Moment #37**, click **Jogar** once, and let that attempt finish. This loads the recording and resumes the audio context before the timed replay.
4. Close **Ajuda**, click the fighting area, release the game buttons, and press **Control + Option + Command + P**. Release the shortcut keys. The macro presses **R**, then sends the fifteen parries and the current twelve-hit counterattack: **jumping heavy kick → crouching medium kick → medium Shoryuken → cancel its first hit into Shippu Jinraikyaku**. The inputs finish after about 8.6 seconds; the knockout and win screen follow afterward.

**Esc** stops an active replay. **Control + Option + Command + X** or **37 → Stop** also cancels it. Changing applications stops the replay, and cancellation/Quit release any keys the macro pressed. Keep the game tab selected until the sequence finishes. Quit the menu-bar app when finished testing.

Disable Vimium's shortcuts for the game page if you use that extension; its R shortcut reloads the whole page instead of retrying the challenge.

The replay comes from `web/tests/golden-inputs.json`, at 60000/1001 Hz. The launcher compares the sequence contents with the bundled copy, so preserved or older file timestamps cannot leave stale inputs in the app. Every attempt reloads that bundled copy. The fixture must include the current Shoryuken and first-hit super-cancel stages; old fixtures without that finish are rejected. Buttons change halfway between engine sample points, giving approximately 8.3 ms of alignment margin. It uses absolute Mach-clock deadlines, short sleeps and a 3 ms final spin to avoid macOS timer coalescing near an input; delays do not accumulate between kicks. If macOS misses a posting deadline by more than 3 ms, the macro stops instead of sending a burst of overdue input.

With Luiz starting on the right, forward is **Left**. The current finish uses **D** for jumping HK at frame 472; **Down + S** for crouching MK at 494; **Left → Down → Down + Left + X** for MP Shoryuken at 498–503; then **Down → Down + Left → Left** twice, ending with **Left + A** at 514–515 for Shippu. Frame 516 releases all keys. These are zero-based input frames from the verified fixture, not historical controller timings.

The macro's parry inputs now aim near the middle of the challenge's ten-frame windows. A warm browser retry starts synchronously from the R event timestamp. macOS event delivery and browser stalls can still move an input to another game frame, so this is **not a guarantee of frame-perfect browser reception**. If the replay slips, use **37 → Input alignment** to shift the game inputs by −16…+16 ms relative to R, in 4 ms increments. Positive values send inputs later. Re-load the recording once after refreshing the game before trying the macro again. After a reference-sequence update, run the launcher to refresh the bundled inputs; the next attempt reads that new copy. After a Swift code update, quit and relaunch the menu-bar app as well.

The initial focus check accepts a recognized browser even when macOS does not expose its focused accessibility element or page title. It blocks identifiable text fields and volume sliders. Keep the game tab selected: this external macro cannot verify the active web page when that metadata is unavailable. It never reads the game engine to synchronize, so a game pause or refresh during the replay invalidates the timing. The macro also works with the game in Codex's browser if macOS exposes its focused web area through accessibility; use Chrome or Edge if the focus check cannot identify it.

Validation commands from this directory (they do **not** press any keys):

```sh
./"Run Evo 37 Macro.command" --self-test
./"Run Evo 37 Macro.command" --dry-run
./"Run Evo 37 Macro.command" --export-plan
./"Run Evo 37 Macro.command" --timing-test
./"Run Evo 37 Macro.command" --ui-check
node verify.cjs
```

The self-test reconstructs every input frame from the generated macOS key transitions and compares it with the successful fixture, including the final key releases. `--export-plan` writes that same schedule as JSON. `verify.cjs` builds the tool, checks its bundled fixture, and feeds the exported macOS key schedule through the game's timestamped keyboard sampler and native engine in a test browser. It requires fifteen parries, the airborne final parry, both native cancels, all twelve connected hits, and a win. It checks key-code bindings and every held input frame without posting macOS events. The timing test measures scheduler lateness on the replay's user-interactive queue and fails if any deadline exceeds the same 3 ms limit, without posting events. The UI check briefly opens and closes the menu-bar app and validates its shortcuts without requesting permissions or sending keys. These checks do not measure actual macOS-to-browser event delivery.

API references: [Apple Quartz keyboard events](https://developer.apple.com/documentation/coregraphics/cgevent), [Apple's monotonic clock](https://developer.apple.com/documentation/driverkit/mach_absolute_time), [post-event permission](https://developer.apple.com/documentation/coregraphics/cgpreflightposteventaccess()).
