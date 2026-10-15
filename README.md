# Lula Moment #37

A playable browser challenge built from the `3sx` C engine and a local PS2 disc image. Ken versus Chun-Li on the NYC subway stage, one health point, a scripted Houyoku-sen, fifteen parries and a counterattack to win. Keyboard, standard browser controllers and mobile touch controls are supported.

## Play

The built game is already in `web/dist`. No build is needed to play it:

```sh
npm start
```

Open **http://localhost:3737** in a browser with WebGL 2. Click **Jogar** (or press Enter / controller Start). The build initializes the fixed fight directly. There are no title, menu, selection or round-intro sequences. The game fills the available viewport with parry progress and Help in its top bar, and the attempt counter and game controls in its bottom bar. Help contains the instructions and keyboard/controller mappings; it pauses an active attempt while open.

The default artwork uses the two suited fighters inspired by the supplied video and portraits: a cream hat, white beard and a navy tie with green, gold and fine pale diagonal stripes for Luiz (Ken’s replacement), and dark hair with gray temples, a gray suit and blue tie for Flávio (Chun-Li’s replacement). The gray-suited fighter has bare eyes and a face based on the supplied close-up. **Jogo original** in the top bar restores the original sprites, HUD portraits and names. On mobile it appears in the existing ☰ settings menu. Switching artwork updates the current frame immediately, including while paused, and retains the current attempt, positions, health, inputs and timing. The selection survives retries; a fresh page load defaults to the new artwork. The health bars show the approved faces and pixel lettering for **LUIZ** and **FLÁVIO**.

| Action | Keyboard | Xbox / PlayStation controller |
| --- | --- | --- |
| Move / parry | Arrow keys | D-pad or left stick |
| Light / medium / heavy punch | Z / X / C | X / Y / RB · Square / Triangle / R1 |
| Light / medium / heavy kick | A / S / D | A / B / RT · Cross / Circle / R2 |
| Retry | R | Back / Share |
| Pause / resume | Space or Escape | Start / Options |

On a phone or touch tablet, play in **landscape**. The overlay D-pad supports eight directions and sliding through quarter circles; the right buttons provide LP/MP/HP and LK/MK/HK. Lift your thumb between forward taps. Multiple fingers can hold a direction and attack together. Touch events use the same timestamped simulation input path and ten-frame parry rule as keyboard and controller input. Touch buttons appear only during active mobile play. Rotating to portrait pauses the attempt and clears held touches; rotate back and tap Resume. Pause, Help, retry, cancellation and loss of pointer capture also release touches. Mobile hides the desktop header/footer, places the D-pad and attack buttons at the sides of the centered game. A small ☰ menu pauses play and contains both volumes, Assistance, Help, retry and fullscreen. Closing Help returns to that menu; closing the menu resumes only if play was running before it opened. The layout accounts for display safe areas, retains the game's 4:3 aspect ratio, and puts the optional guide above the attack buttons. Mobile initializes a fixed 768×576 backing buffer, so loading in portrait cannot leave the renderer with a zero-sized or low-resolution canvas. Viewport changes are also checked each display callback for browser paths that omit resize events. Desktop controls and layout are unchanged.

On iPhone, Safari’s address bar and tabs cannot be hidden by page code. Use **Share → Add to Home Screen**, then launch the game from its icon to open it as a standalone web app. The manifest and Apple metadata support this mode, with paths relative to the GitHub Pages project URL. Browsers supporting element fullscreen offer **Full screen** in the mobile menu. The game remains online; no service worker caches the large native bundle.

Ken starts on the right, facing Chun-Li on the left. Tap **left**, then release, for each parry. Jump before the last kick and tap forward in the air. Counter with jumping heavy kick → crouching medium kick → medium Shoryuken → Shippu Jinraikyaku. Land the jump kick low, link the crouching kick, cancel it into forward → down → down-forward + MP, then cancel Shoryuken’s first hit into two quarter circles forward + kick. Ken wins only after all fifteen parries (the last airborne), this connected twelve-hit combo and an actual engine-calculated knockout. A dropped combo or different finish fails the challenge. The game also supports ordinary movement, attacks and super commands; there is no automatic parry or combo button.

**Assistance** in the header toggles a falling input guide beside the game. Tap when a falling symbol overlaps its matching dimmed target; its tail shows how long the reference holds that direction or attack. Targets share the falling notes' size and shape, and light up at the exact input frame. It includes all fifteen parries, the jump, jumping heavy kick, crouching medium kick, the Shoryuken motion and medium punch, and both quarter-circle motions for the super cancel. Attack notes use HK/MK/MP/LK, with D/S/X/A underneath for keyboard play. The toggle starts off and retains its choice on retry.

The guide reads the native engine's next input-frame index after each simulation step. It uses no wall-clock animation or delayed timers, so pause freezes the notes and retry returns them to the start. Its cue file is copied from the same successful input fixture used by the local macOS macro. Parry symbols aim near the middle of the valid ten-frame window; shaded bands show its extent and the dimmed forward target glows for every valid frame. The airborne cue is at input frame 441, ahead of contact at 445. Counterattack cues also sit inside their valid ranges. Green feedback comes from confirmed engine parries. If an attempt misses a required parry, or changed positioning shifts the reference contact rhythm, the guide freezes and asks for a retry. Assistance never supplies inputs.

The interface is in Brazilian Portuguese and uses the title **Lula Moment #37**. The top bar’s **Som** button opens independent **Jogo** and **Torcida** volume sliders, both starting at 100%; 0% mutes a track. The panel closes on an outside click or Escape and is also available inside the mobile menu. Loading, Help, assistance, pause, accessibility labels and touch controls are translated. A failed attempt shows only **Tentar novamente**; the footer has no phase slogan. Starting with Evo above 0% loads a local 16-second PCM clip from the requested Evo Events recording, beginning at its super-activation frame (video frame 896 at 30 fps, 29.8667 seconds). The recording is aligned to the engine’s confirmed Houyoku-sen activation. Playback follows the ratio between the PS2 clock and the original challenge’s 59.59949 Hz recording alignment, preserving synchronization after the clock correction. Pause holds the recording at the game clock; resume restores the matching offset; retry resets it and preserves both volume settings. Help links to the official recording and the requested Bonus video.

Where supported, the browser requests a `playback` Audio Session before creating its audio context. This addresses [WebKit's Silent Mode behavior](https://bugs.webkit.org/show_bug.cgi?id=237322) for both tracks on iPhone Safari. Start and trusted input gestures prime the output and resume suspended or interrupted contexts. An unexpected audio interruption pauses the challenge; Resume restores the audio context before advancing any game frames and resumes the recording from its saved game position. Browsers without Audio Session support keep the standard Web Audio path.

The Evo recording stops immediately when a kick hits or is blocked without a parry, when a required kick's active window closes without a parry (including moving out of range), or when Ken takes damage. A failed sequence stays muted until retry. The adapter observes the original engine's attack IDs and confirmed parries; it does not use wall-clock deadlines or change combat calculations. Kicks 5 and 13 naturally miss at the reference spacing and are allowed. After all fifteen parries, the recording can continue through the counterattack and crowd reaction. A failed finish also stops it.

The local server binds to your own computer. No player account is needed. The page includes Cloudflare Web Analytics for aggregate visit metrics. Music and sound effects use the original sound engine; the browser enables audio after user interaction.

## What runs in WebAssembly

`web/CMakeLists.txt` compiles the game sources, command parser, collision checks, fixed point movement, animation and damage calculation from `3sx/src`. **The `3sx` checkout is unchanged.** JavaScript supplies input buttons and schedules fixed ticks at 60000/1001 Hz (approximately 59.94), based on [PS2 timing](https://github.com/PCSX2/pcsx2/blob/master/pcsx2/Counters.cpp). Combat decisions remain native. This challenge deliberately overrides one original rule: every fresh forward tap arms exactly ten simulation frames for the super's grounded and airborne parries, including during super freeze. The native adapter synchronizes that timer just before the original defense routine checks it. Actual hitboxes, eligibility, parry effects, pushback, damage and knockout calculations remain in the engine. A successful parry consumes the tap; holding forward cannot parry successive hits.

`web/dist/timing.js` keeps the simulation clock independent of display refresh. Keyboard transitions and controller snapshots retain their timestamps and are sampled at each game tick. Short direction and attack-button presses survive for one sample even when their press and release both fall between ticks, or arrive together before a delayed display callback. Separate forward-edge metadata preserves a neutral release and fresh tap even within the same sample. A short pulse never becomes a continuously held button. New controller snapshots are not copied onto older catch-up frames. Intermediate catch-up frames execute all combat calculations; the browser draws the latest state. A display callback stalled for more than four game ticks pauses the attempt rather than silently dropping elapsed time or rushing through missed inputs. Pause/resume retain currently held buttons, discard old queued transitions, and reset the clock. Retry clears queued keyboard input. When audio is already prepared, R retries synchronously and anchors the clock to the received R event timestamp; cold audio preparation occurs before the first attempt's clock starts.

The changes are outside that checkout:

- `web/native/webgl_renderer.c` and shaders adapt the desktop OpenGL renderer to WebGL 2, retaining the original indexed textures, palettes and draw commands.
- `web/characters/art/native` contains a separate redraw for each distinct native character bitmap, using the requested bare-eyed face, blue tie on the gray suit, and striped navy, green and gold tie on the hat character. The catalogue covers all 799 animation scripts and all 2,695 graphic IDs, including overlap pieces and damage poses selected directly by native code. Only 813 byte-identical native graphics share artwork; similar poses never substitute for one another. Ken’s eleven abstract fire-trail drawings retain their original pixels and colors. `build_native.lua` refuses incomplete coverage. Exports retain each original graphic's exact origin and dimensions, binary alpha, and a common 128-color palette without dithering. The original interpreter still controls drawing order, durations, branches, flips, movement, hit stops, and landing conditions. Both artwork sets use the game's original 384×224 framebuffer. A generated copy of `aboutspr.c` tags player and afterimage draw requests so the WebGL renderer can select artwork. `web_original` replays the last draw list without a simulation tick; palette flashes, transparency and brightness also apply to custom artwork.
- `web/native/web_support.c` supplies browser input and host services in place of desktop configuration, filesystem discovery and controller discovery.
- `web/native/web_app.c` selects the fixed matchup, initializes the challenge state, records and consumes the ten-frame forward-tap window, supplies Chun-Li's super command through the original pad interface, observes confirmed hit order and both native cancel transitions, and restores the original engine state on retry. Resets also restore effects, background state, background-layer switches, HUD tiles, palettes and pad history, recompute the renderer's scale from the saved camera zoom, and invalidate the renderer’s texture cache. Pixel comparisons verify the same rendered scene after a KO and when retry interrupts Chun-Li's super zoom.
- `web/native/moment_runtime.c` initializes only Ken, Chun-Li and their stage. `web/specialize.py` copies the original frame loop verbatim, restricts dispatch tables to this scene, and generates a copy of `hitcheck.c` with the explicit parry-timer hook at the start of the two PS2 defense routines and a read-only finish observer after confirmed-hit combo bookkeeping. The observer grades the move sequence and combo continuity without changing damage, attack inputs or cancel windows. The title/menu/selection routes are absent from the linked module; `web/audit_build.py` checks the linker symbol map and resource manifest.
- `web/prepare_assets.py` reads the supplied ISO9660 disc and repacks the required AFS entries. Resource numbers and every included resource's contents remain unchanged. `web/assets/manifest.json` records their source offsets, sizes and SHA-256 hashes.

This build uses 3SX revision `7bf8ab611b64ab762aa36324aa2942dee5285174`, Emscripten 6.0.11 and SDL 3.4.12. Emscripten's function-pointer cast emulation handles legacy C callbacks that a native executable accepts but WebAssembly otherwise rejects.

### Fidelity limits

This is a reconstruction using the provided **PS2 engine and assets**, with the deliberate ten-frame parry rule described above. It keeps the PS2 combat path and default system direction settings underneath that override; it does not claim PS2- or arcade-identical behavior. Browser presentation remains tied to the display’s refresh rate, and the Gamepad API only exposes snapshots observed by the browser. This cannot recover controller transitions that the browser never reports. Physical controller-to-screen latency and per-frame equivalence to a reference PS2 run have not been measured.

The historical 2004 controller recording and exact savestate were not supplied. Chun-Li's super command, remaining health and meter are reconstructed. Position and camera measurements come from the official footage just before the super, around 0:29: Ken on the right, Chun-Li on the left, with approximately 243 game pixels between their origins. The camera and sprite offsets are initialized before the scene is shown. The engine itself generates the complete attack sequence, including the two spacing-related missed kicks and fifteen connecting kicks. Starting health is Ken 1 / Chun-Li 60 (calibrated so the full twelve-hit finish delivers the knockout), with one super stock each; timer 26; third-round stage music; Ken's white costume and Chun-Li's blue costume. Chun-Li inputs the super after a short neutral lead-in and then releases the controls. The reference clip is [Evo Events' official Moment 37 video](https://www.youtube.com/watch?v=JzS96auqau0).

`web/tests/golden-inputs.json` is a regression fixture for this build, **not Daigo's recorded inputs**. It verifies fourteen grounded parries, the airborne final parry, a connected jumping heavy kick → crouching medium kick → first hit of medium Shoryuken → Shippu, with the original engine confirming both cancels, all twelve combo hits and the knockout. The reference inputs and assistance cues are timed for this build; the challenge accepts successful engine-confirmed execution at other timings as well.

## Build again

The `3sx` checkout, ISO, toolchains, and intermediate resources are ignored by Git. To prepare the engine source in a fresh clone:

```sh
git clone https://github.com/crowded-street/3sx.git 3sx
git -C 3sx checkout 7bf8ab611b64ab762aa36324aa2942dee5285174
```

Supply your local disc image as `Street Fighter III - 3rd Strike (English v1.0).iso`, or pass its path to `web/build.sh` after toolchain setup.

CMake, Ninja, Git and Python 3.10+ are needed for toolchain setup. On macOS, `brew install cmake ninja python` provides the missing prerequisites. Run:

```sh
bash web/setup.sh
```

This downloads the pinned Emscripten and SDL toolchains into `.tools`, extracts your local disc resources and builds the game. After setup, rebuild with:

```sh
npm run build
```

To use an ISO at a different location:

```sh
bash web/build.sh "/absolute/path/to/your-disc.iso"
```

The build prepares approximately 10.4 MiB of disc resources. The ISO and intermediate extracted resources stay local and are ignored by the source-control rules. The deployable `web/dist` bundle is tracked, including `engine.js`, `engine.wasm`, and `engine.data`. Do not assume `engine.data` is source code: it contains the disc's game assets.

## GitHub Pages

`.github/workflows/pages.yml` publishes `web/dist` on every push to `main` and can also be run manually. The repository's Pages publishing source is **GitHub Actions**. CI deploys the prebuilt static bundle; it does not need the ISO, 3SX checkout, or native toolchains. When native code changes, rebuild locally and commit the updated engine files before pushing.

The game is hosted at **https://jpcrs.github.io/lula-moment-37/**. All runtime URLs are relative so the game works under the repository path.

## Verify

```sh
npm ci
npx playwright install chromium webkit
npm run test:parry
npm run test:finish
npm test
npm run test:timing
npm run test:audio
npm run test:interface
npm run test:mobile-audio
npm run test:assistance
npm run test:mobile
npm run test:characters
npm run test:native-animations
python3 web/audit_build.py
```

The parry-window test sweeps all ten valid input frames for all fifteen contacts: 150 accepted inputs, plus 30 rejected inputs immediately outside the windows. Thirty complete sequences exercise early, late and mixed tap positions. It also checks 60 keyboard/controller input cases through delayed browser frames, including one-millisecond keyboard taps, and verifies that holding forward cannot parry successive hits.

The finish test replays actual pad inputs, checks all twelve native confirmed hits and both cancel transitions, and rejects missing or wrong-strength Shoryukens, a second Shoryuken hit, grounded final parries, early jump kicks and dropped combos. It verifies alternative valid timings and clears grading state on retry.

The browser integration test starts its own temporary local server, boots the real engine, checks the characters/stage/costumes/positions, compares the rendered scene before and after a KO and retry, verifies the neutral-input loss, plays the complete parry-and-KO sequence twice, tests keyboard input and pause, tests standard gamepad input, pause and retry through the browser input loop, and verifies resumed audio with nonzero PCM output from the original sound engine. It writes a screenshot to `web/tests/win.png`. The timing check verifies 600 simulation ticks in 10.01 seconds across 60/120/144/165 Hz schedules, timestamped keyboard and controller input through the browser loop, the same fifteen parries and KO at 60/120/144 Hz, and stall pause/resume without skipped game frames. The audio integration check verifies independent volume sliders, lazy loading, native super activation, playback rate, track start offset, pause/resume, retry, and the two Help links. It also verifies that the recording stops on missed parries and escaping, stays stopped until retry, and continues through a successful sequence.

The mobile integration check exercises portrait gating, rotation during play and Help, menu pause/resume and Help navigation, standalone manifest/icon paths, side-control placement, real browser multi-touch and pointer capture, sliding two quarter circles while holding a kick, cancellation, pause, retry, ten sub-frame parry taps, and a complete winning sequence through the touch input loop. It checks phone and tablet landscape layouts with and without assistance. It also boots the engine and checks touch/pause/orientation behavior in WebKit. Screenshots are saved to `web/tests/mobile-landscape.png` and `web/tests/mobile-portrait.png`.

The mobile audio test measures nonzero signal after both volume gains in Chromium and WebKit, checks WebKit's playback session type, simulates an interrupted context, verifies that gameplay freezes until audio resumes, and checks volume preservation on retry. Browser emulation cannot verify a physical iPhone's speaker or Silent Mode switch.

Automated controller checks use the standard Gamepad API with a simulated pad. A physical controller has not been attached for this test. Mobile checks emulate touch devices in Chromium and WebKit; a physical phone has not been tested.

The character test compares all 66 exposed native values on every frame of the complete winning sequence in custom mode, original mode, and with repeated switches during play. It also checks visible changes, exact return to the custom frame, keyboard activation, switching while paused, and access to the toggle in the mobile menu.

To repack the saved illustrated artwork with Aseprite 1.3+:

```sh
aseprite -b --script-param aseprite_mcp_workspace="$PWD" --script web/characters/build.lua
npm run build
```

The editable sources are `hat-fighter-native.aseprite`, `gray-fighter-native.aseprite`, and `gray-fighter-native-extra.aseprite` in `web/characters`. The gray fighter’s project is split into two parts to stay below repository file-size limits. Tags name every native graphic ID. Cels use a 3× working scale with world origin `(960, 1100)`; the strict packer samples the original native rectangle on a fixed 3×3 grid and uses one shared palette across all atlas pages. Repacking needs no image-generation service. See `web/characters/README.md` for the complete extraction, import, and review workflow.

`native-animations.json` records every entry point, header, frame duration, flip, overlap, raw record and control opcode from the original ten animation banks. It documents the original interpreter rather than replacing it with an estimated animation clock. The previous silhouette map and the old breathing mesh are retained only as historical source files; the native redraw pipeline does not use them.

Run the artwork comparison locally:

```sh
python3 web/characters/review.py --port 3751
```

Open `http://localhost:3751` to compare original and replacement drawings with the same frame IDs, origins and flips. This is an art reviewer: gameplay branches, physics, hit stops and landing conditions run in the game. The held-pose shortening option affects this viewer only. The redraws reconstruct the supplied characters in the native poses; they are not the video's original production artwork.

`npm run test:native-animations` verifies all 2,695 graphic bindings, exact native placement and dimensions, and that only identical original drawings share a packed rectangle. It also compares live native animation and combat state in original/custom modes across eleven movement and attack inputs and the complete winning sequence, including the moving-jump somersault and Chun-Li’s super, and checks the catalogue against the native VM. These checks establish binding and timing correctness; artwork fidelity also requires visual review.

## Attribution

Street Fighter III: 3rd Strike and its original game assets are Capcom's. 3SX is the [Crowded Street native port](https://github.com/crowded-street/3sx), derived from [3s-decomp](https://github.com/crowded-street/3s-decomp). Its AGPL-3.0 license and third-party notices are preserved in `3sx` and copied into `web/dist` by the build. The bundled Barlow Condensed and DM Sans fonts use the SIL Open Font License; their notices are in `web/dist/fonts`. SDL is distributed under the zlib license; Emscripten under MIT and University of Illinois/NCSA licenses. The browser port source in `web/native` is provided under the same AGPL-3.0 terms as the engine; the full license is in `LICENSE`. Help links to the engine project, decompilation project, browser port source, and license.
