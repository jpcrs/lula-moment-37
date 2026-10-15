#!/bin/zsh
set -euo pipefail
TASK_MACRO_DIR="${0:A:h}"
TASK_MACRO_APP="$TASK_MACRO_DIR/build/Evo 37 Macro.app"
TASK_MACRO_EXECUTABLE="$TASK_MACRO_APP/Contents/MacOS/Evo37Macro"
TASK_MACRO_SEQUENCE="$TASK_MACRO_DIR/../../web/tests/golden-inputs.json"

if [[ ! -x "$TASK_MACRO_EXECUTABLE" || "$TASK_MACRO_DIR/Evo37Macro.swift" -nt "$TASK_MACRO_EXECUTABLE" || "$0" -nt "$TASK_MACRO_EXECUTABLE" ]] || ! cmp -s "$TASK_MACRO_SEQUENCE" "$TASK_MACRO_APP/Contents/Resources/sequence.json"; then
  mkdir -p "$TASK_MACRO_APP/Contents/MacOS" "$TASK_MACRO_APP/Contents/Resources"
  cp "$TASK_MACRO_SEQUENCE" "$TASK_MACRO_APP/Contents/Resources/sequence.json"
  cat > "$TASK_MACRO_APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleIdentifier</key><string>dev.jpcrs.evo37-macro</string>
  <key>CFBundleName</key><string>Evo 37 Macro</string>
  <key>CFBundleDisplayName</key><string>Evo 37 Macro</string>
  <key>CFBundleExecutable</key><string>Evo37Macro</string>
  <key>CFBundleVersion</key><string>2</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>LSUIElement</key><true/>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
</dict></plist>
PLIST
  TASK_MACRO_ARCH="$(uname -m)"
  xcrun swiftc -swift-version 5 -O -target "$TASK_MACRO_ARCH-apple-macos13.0" \
    "$TASK_MACRO_DIR/Evo37Macro.swift" -o "$TASK_MACRO_EXECUTABLE" \
    -framework AppKit -framework Carbon -framework CoreGraphics
  codesign --force --sign - --identifier dev.jpcrs.evo37-macro "$TASK_MACRO_APP"
fi

if (( $# > 0 )); then
  "$TASK_MACRO_EXECUTABLE" "$@"
else
  open "$TASK_MACRO_APP"
fi
