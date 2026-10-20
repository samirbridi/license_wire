# ADR-004 — Display resolution and optional Lanczos scaling

Date: 2026-10-20. Status: native fullscreen and bounded CPU reference scaler implemented; GPU high-quality scaling remains open.

OutputWindow binds its native QWindow explicitly to a selected, currently detected QScreen before entering fullscreen. It uses the screen's current desktop geometry and device-pixel ratio; it never changes the OS display mode. Aspect ratio is preserved without cropping or stretching. A disconnected output closes without stopping the Program. Screen menus refresh on connection, disconnection and mode/DPI changes. Reopening a route replaces only that route's window.

Native is the default live profile and forwards shared native frames to QVideoWidget. The renderer fits the frame to its surface. The optional Lanczos CPU profile resolves the public libswscale 8 / libavutil 59 ABI from the same deployed FFmpeg LGPL runtime; pixel-format IDs are resolved by name. It performs SDR spatial resampling with Lanczos and accurate rounding, not AI reconstruction. Missing detail is not recovered by enlargement.

Each Program/pixel-size pair shares one QualityFeed. There is one in-flight worker and at most one newest pending frame; older pending frames are superseded. Black/source changes invalidate stale results. Unused feeds and contexts are released. Same-size frames bypass resampling. High-depth, HDR, cropped/transformed or oversized outputs use Native instead of forcing an 8-bit image conversion. CPU Lanczos output is bounded to 4096×2160-equivalent pixels, not a claim of production support at that size.

## Measured limit

The initial build-0011 run measured roughly 140–200 ms per processed 4K scaling frame on this machine. An isolated thread-count comparison did not resolve that cost. Lanczos CPU is explicitly experimental and not qualified for 4K/30 fps live playout; Native stays recommended. An over-budget warning is emitted without a modal dialog. The final tests count only frames from the correct source resolution, excluding the old Program held during preroll. See output-*-0012.json and scaler-thread-benchmark.json for raw scope/measurements.

Next quality/performance step: a measured GPU scaler/compositor with suitable texture interop. Native CPU decoding, GPU decoding, presentation, scaling and compositing are distinct stages; the D3D11 decoder selection in logs is not proof of NVIDIA/AMD certification or GPU processing of every stage.

## Primary references

- Qt 6.10 QVideoWidget: https://doc.qt.io/qt-6.10/qvideowidget.html
- Qt FFmpeg configuration: https://doc.qt.io/qt-6.10/advanced-ffmpeg-configuration.html
- FFmpeg 7.1 libswscale ABI: https://ffmpeg.org/doxygen/7.1/group__libsws.html
- FFmpeg 7.1 scaler options: https://ffmpeg.org/doxygen/7.1/libswscale_2options_8c_source.html
