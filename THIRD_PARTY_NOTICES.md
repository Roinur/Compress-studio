# Third-Party Notices

Compress Studio uses third-party software and projects listed below.

## FFmpeg

Compress Studio invokes FFmpeg as a separate executable for video encoding, thumbnail extraction, and metadata probing.

- Project: https://ffmpeg.org/
- License information: https://ffmpeg.org/legal.html
- Source code: https://ffmpeg.org/download.html
- Bundled npm package: https://github.com/eugeneware/ffmpeg-static
- npm package license: GPL-3.0-or-later

The Windows FFmpeg binary bundled through `ffmpeg-static` includes its own license and build information files:

- `node_modules/ffmpeg-static/ffmpeg.exe.LICENSE`
- `node_modules/ffmpeg-static/ffmpeg.exe.README`

Packaged Windows releases copy those files into the installed app's `resources/` folder as:

- `FFMPEG-LICENSE.txt`
- `FFMPEG-README.txt`

At the time this project was prepared, the bundled Windows binary identified itself as:

- FFmpeg 64-bit static Windows build from www.gyan.dev
- Version: 6.1.1-essentials_build-www.gyan.dev
- License: GPL v3
- Source Code: https://github.com/FFmpeg/FFmpeg/commit/e38092ef93

If the `ffmpeg-static` package is upgraded, check the generated `ffmpeg.exe.README` file again because the bundled FFmpeg version, source commit, and build configuration may change.

## ffmpeg-static

`ffmpeg-static` provides static FFmpeg binaries for macOS, Linux, and Windows as an npm dependency.

- Project: https://github.com/eugeneware/ffmpeg-static
- License: GPL-3.0-or-later

## 8mb-videocompressor

Compress Studio's desired-size workflow is inspired by `k0rucha/8mb-videocompressor`.

- Project: https://github.com/k0rucha/8mb-videocompressor

Compress Studio does not run or bundle the original console executable from that project. The app implements its own Electron queue UI and invokes FFmpeg directly.
