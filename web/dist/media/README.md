# Full winning run

[Watch the video](https://jpcrs.github.io/lula-moment-37/media/lula-moment-37-full-run.mp4)

`lula-moment-37-full-run.mp4` records the complete challenge with Luiz and Flávio: the start screen, fifteen parries (the last airborne), jumping heavy kick → crouching medium kick → medium Shoryuken canceled on its first hit into Shippu, the twelve-hit knockout, and the victory screen. The game audio and crowd reaction are included.

The MP4 uses H.264 video at 1440 × 1080 and 60000/1001 fps, with stereo AAC audio. It is a continuous browser-tab recording of the real native engine executing the verified player inputs at normal speed, with the victory screen held at the end.

To record again from the repository root, run `node tools/record-sequence.cjs`. Install the project’s npm dependencies and Playwright Chromium, and have FFmpeg/ffprobe and Python 3 available. On macOS, the recorder opens an isolated Chromium window because tab capture requires a headed browser. It captures only that game tab, mixes the existing audio outputs, and supplies the reference input timestamps through the normal input sampler. It does not alter combat state or the website’s source files.
