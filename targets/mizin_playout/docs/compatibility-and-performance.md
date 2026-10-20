# Compatibility, GPU use and output resolution

Validated scope: Windows prototype, Qt 6.10.2 / native FFmpeg 7.1.2. See evidence/validation.json for the exact package, fixtures and limits.

| Stage | Current behavior | Qualification |
| --- | --- | --- |
| Decode | Automatic hardware selection, or forced CPU decoding in Settings | D3D11VA selection observed for H.264/H.265 samples. Exact GPU adapter was not attributed by the log; AMD is not present on this development machine. |
| Presentation / Native scaling | QVideoWidget fits shared native frames to the output surface | Fullscreen geometry checked against the detected SONY TV desktop screen at 1920×1080 / 60 Hz. Physical visual approval, signal integrity and multi-display synchronization remain open. |
| Transitions | Shared CPU image compositor per Program | Functional Cut/Dissolve/Fade tests; not a GPU compositor. |
| Lanczos scaling | Optional, experimental 8-bit SDR CPU resampler using deployed LGPL libswscale | Actual 1080p→4K and 4K→1080p frames checked. Current CPU service times exceed the 30 fps budget; not a live 4K profile. |

## Media compatibility

The existing fixture matrix covers H.264 MP4/MKV, H.265 MP4, MJPEG AVI and ProRes MOV; separate H.264 1920×1080 and 3840×2160 clips cover resolution handling. Files are decoded locally without a mandatory pre-conversion step. This does not establish every codec, profile, bit depth, chroma subsampling, HDR/alpha mode or damaged-file behavior. A container extension such as MP4, MOV or AVI does not identify all of those properties. Unsupported incoming media reports an error and retains the current Program.

## Resolution and quality

Fullscreen uses the selected display's current desktop mode and pixel ratio. The application does not change the OS display mode. For matching 16:9 ratios, 3840×2160→1920×1080 reduces the image, and the reverse enlarges it. Other ratios fit inside the surface with black bars, preserving geometry. The original media is not modified.

Native remains the live default. Lanczos performs spatial resampling without AI reconstruction: it cannot recover detail absent from the original. It is a reference quality option for profiling, not a claim of minimum perceptual loss for every kind of image. High-depth/HDR/transformed frames use Native rather than being silently forced through an 8-bit path. The app reports a warning when Lanczos exceeds the source cadence budget, without interrupting operation with a dialog.

The worker keeps at most one in-flight job and one latest pending frame; overload can supersede video frames. Mirrored outputs at equal pixel sizes share the result. This bounds the queue, but does not prove AV synchronization. A measured high-quality GPU scaler/compositor is the next performance step.

## Primary references

[Qt FFmpeg backend selection](https://doc.qt.io/qt-6.10/advanced-ffmpeg-configuration.html), [Qt video widget](https://doc.qt.io/qt-6.10/qvideowidget.html), [FFmpeg 7.1 resampler API](https://ffmpeg.org/doxygen/7.1/group__libsws.html). These describe capabilities and interfaces, not performance qualification of this application.
