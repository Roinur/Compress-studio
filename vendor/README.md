# Vendor

Compress Studio does not store large `.exe` binaries in git.

FFmpeg is provided by the `ffmpeg-static` npm dependency during `npm install` and is packaged from `node_modules/ffmpeg-static/` by electron-builder.

Compression behavior is credited to [`k0rucha/8mb-videocompressor`](https://github.com/k0rucha/8mb-videocompressor), but Compress Studio drives FFmpeg directly from the Electron app so selected files can run in the background without reopening the original console workflow.
