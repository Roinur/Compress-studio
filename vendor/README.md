# Vendor

Compress Studio does not store large `.exe` binaries in git.

FFmpeg is provided by the `ffmpeg-static` npm dependency during `npm install` and is packaged from `node_modules/ffmpeg-static/` by electron-builder.

The desired-size compression workflow is inspired by [`k0rucha/8mb-videocompressor`](https://github.com/k0rucha/8mb-videocompressor), but Compress Studio drives FFmpeg directly from the Electron app so selected files can run in the background without reopening the original console workflow.

FFmpeg license and build notes are kept in the npm package and copied into packaged releases as app resources. See `THIRD_PARTY_NOTICES.md` in the repository root.
