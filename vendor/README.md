# Bundled binaries

Compress packages these Windows binaries so the app can run without extra setup:

- `ffmpeg.exe`: used for probing, thumbnail extraction, and video encoding.
- `console.main.exe`: local bundled build of the original compression utility lineage, credited to [`k0rucha/8mb-videocompressor`](https://github.com/k0rucha/8mb-videocompressor).

Compress Studio now drives FFmpeg directly from the Electron app so selected files can run in the background without reopening the original console workflow.
