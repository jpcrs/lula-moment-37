# Native character artwork

The game uses the original Ken and Chun-Li animation interpreter. Artwork replaces native CG numbers at their original world origins and sizes. Luiz (Ken’s replacement) wears the approved hat, beard and charcoal suit, with the navy, green, gold and pale striped tie from `art/native/tie-reference.png`; Flávio (Chun-Li’s replacement) uses the approved clean-shaven face, gray suit and blue tie.

`native-animations.json` inventories 799 scripts and 1,377 entry points across the ten native animation banks. `native-redraw-plan.json` covers all 2,695 graphics, including direct damage and overlap graphics outside those scripts. There are 1,882 distinct native indexed bitmaps and 813 exact aliases. No approximate silhouette aliases are permitted.

## Edit and pack

Edit `hat-fighter-native.aseprite`, `gray-fighter-native.aseprite`, or `gray-fighter-native-extra.aseprite`. The gray fighter’s source is split into two parts to stay below repository file-size limits. Each one-frame tag is its native CG number. Cels use 3× working resolution and world origin `(960, 1100)`. Their native bounding rectangles are recorded in the redraw plan. Keep artwork inside those rectangles; the exporter samples that fixed grid rather than fitting an independently changing crop.

From the repository root:

```sh
aseprite -b --script-param aseprite_mcp_workspace="$PWD" --script web/characters/build.lua
npm run build
npm run test:native-animations
npm run test:characters
```

`build_native.lua` checks every native graphic before writing atlas files. Exports use the original dimensions and placement, binary alpha, the fixed 128-color `native-palette.aseprite`, which retains all previous suit, face and native fire colors and adds navy and green fabric colors, and nearest-neighbor game rendering. Missing cels fail the build. Aliases share packed artwork only when their original indexed images and dimensions are identical.

## Standing animation continuity

The 18 standing drawings use `native-idle-masters.aseprite` and `native-idle-motion.json`. The two approved master cels share the same origin and 3× working resolution as the native projects. A hidden fabric mask travels with Luiz’s tie; a separate hidden drawing supplies Flávio’s blink. Head and fist displacements follow features measured in the native idle drawings, and waist/knee displacements follow registered native cloth patches. Feet stay planted, facial details keep their proportions, and the fabric bends between those features. The engine still uses every original CG and hold duration, including Ken’s moving guard and Chun-Li’s reverse sequence.

After editing these masters or motion values, run `apply_native_idle.lua` before packing. It changes only Ken CG 14657–14666 and Chun-Li CG 19472–19479. The sheet importer applies this same pass after a complete re-import. It never runs the historical `animate.lua` approximation.

```sh
aseprite -b --script-param aseprite_mcp_workspace="$PWD" --script web/characters/apply_native_idle.lua
aseprite -b --script-param aseprite_mcp_workspace="$PWD" --script web/characters/build.lua
```

`preview_native_idle.lua` exports native/original and before/after standing comparisons under `outputs/idle-fix`; the before/after view expects the local pre-edit backup there. Inspect the entire loop, including the last-to-first transition, when changing a track.

## Striped tie

`striped_tie.lua` maps the supplied fabric colors and diagonal repeat onto the existing red-cloth silhouette. Its principal axis follows each pose and retains the cloth’s shading, alpha and gold tie clip. `apply_striped_tie.lua` updates existing editable sources; `import_native.lua` uses the same helper for future imports. The hidden **Tie fabric mask** layer identifies the changed cloth. The packer quantizes other pixels against the original 126 entries, then composites masked cloth using all 128 entries. This keeps the two new colors from changing Flávio, skin, suits or native fire. Retain the mask when editing a tie.

## HUD portraits and names

`hud.aseprite` contains the native-size Luiz and Flávio portraits, cropped from the approved designs, and bold pixel lettering with Flávio’s accent. The names use the native HUD’s five-pixel capitals, two-pixel stems, off-white ink, gray shadow and dark backing strip. Edit that project and run `build_hud.lua` to export `web/dist/characters/hud.png`; the main `build.lua` also exports it. Pass `refresh_labels=true` to rebuild just the names while preserving every portrait and panel pixel. Pass `refresh_hud=true` only to recreate the entire editable project from the references. A generated copy of `sc_sub.c` marks only the native portrait and name draw calls. Their placement, visibility, brightness and depth are retained; health, stun and super bars are unchanged. Original game restores the original portraits and names without a simulation tick.

## Import source sheets

`art/native` preserves the generated transparent sheets, two approved identity references, and the generation prompts. `import_native.lua` imports every grid cell according to the redraw plan, aligns it with the corresponding native rectangle, and creates the complete editable projects. Exact aliases with identical origins use linked cels; aliases at different origins remain separate. Run this only when intentionally rebuilding those source projects: it replaces direct cel edits.

```sh
aseprite -b --script-param aseprite_mcp_workspace="$PWD" --script web/characters/import_native.lua
```

`native-effects.aseprite` preserves eleven native Ken fire drawings with no original fighter face or costume. Importing uses these exact pixels instead of the generated cells at CG 15648–15658. `native-effects.json` records their RGBA hashes; the browser test verifies that packing preserves every pixel. The project also keeps 96 abstract Chun-Li energy and trail drawings from CG 20992–21088, excluding CG 21074, which contains her body and uses a redraw. These effects retain their native shapes and use the common export palette. This prevents generated figures from appearing inside effect-only graphics. X-ray and unrelated effect refinements are outside the requested Ken-versus-Chun-Li pass.

Full imports and packing can exceed the MCP server’s one-minute timeout. The same scripts can run through the Aseprite batch commands above without that limit.

The original local resources are needed only to repeat the extraction and prepare new pose guides:

```sh
python3 web/characters/extract.py
python3 web/characters/catalog.py
python3 web/characters/prepare_redraw.py
aseprite -b --script-param aseprite_mcp_workspace="$PWD" --script web/characters/preserve_native_effects.lua
aseprite -b --script-param aseprite_mcp_workspace="$PWD" --script web/characters/guides_native.lua
```

Extraction writes ignored study files under `outputs/character-study`. Generated native pose guides are under `outputs/character-audit/guides`. The plan groups distinct script-referenced drawings first, then adds other graphics; changing the grouping requires regenerating matching sheet art.

## Compare drawings

First export the original atlas from the local extracted resources, then serve the reviewer:

```sh
aseprite -b --script-param aseprite_mcp_workspace="$PWD" --script web/characters/export_native_reference.lua
python3 web/characters/review.py --port 3751
```

Open <http://localhost:3751>. Select an entry point, scrub drawings, or play them beside the originals at the same origin and flip. Held poses can be shortened for review. This viewer does not emulate conditional branches, throws, hit stops, physics or landing: the real native engine handles those in the game.

The native-animation test checks every binding and native rectangle, then compares live VM records and fight state under eleven movement and attack inputs and the complete winning sequence. The character test also replays the complete parry and knockout sequence in both artwork modes and while switching. Neither test proves that the redraw is visually identical; use the reviewer and real gameplay for that assessment.

After the native-animation test, export side-by-side GIFs from its actual recorded CGs, flips, and world positions:

```sh
aseprite -b --script-param aseprite_mcp_workspace="$PWD" --script web/characters/preview_native_motion.lua
```

The GIFs are written to `outputs/character-audit/motion`. The original is on the left and the replacement on the right. GIF timing rounds the native ticks to hundredths of a second; the game retains its original simulation rate. The browser test also verifies that the embedded WebAssembly sprite files match the current packed files.

The older `hat-fighter.aseprite`, `gray-fighter.aseprite`, `animate.lua`, `motion.json`, `poses.json`, and `frame-map.json` document the rejected approximation. The strict native pipeline does not read them.
