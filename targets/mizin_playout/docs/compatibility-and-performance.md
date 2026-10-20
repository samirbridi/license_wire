# Compatibility, GPU use and output resolution

Validated scope: Windows prototype, Qt 6.10.2 / native FFmpeg 7.1.2. The exact build, fixtures, hashes and checks are in [validation.json](../evidence/validation.json).

| Stage | Current behavior | Qualification |
| --- | --- | --- |
| Decode | Automatic hardware selection or forced CPU decoding | Existing H.264/H.265 samples selected D3D11VA in diagnostic logs. The decoder adapter is not identified by those logs. |
| Native presentation/scaling | Shared QVideoFrame fitted by QVideoWidget | Default for live use. Detected desktop fullscreen geometry verified; physical signal/visual/sync qualification remains open. |
| Transitions | Shared CPU image compositor per Program | Functional Cut/Dissolve/Fade tests; GPU scaling does not move this composition to the GPU. |
| GPU Lanczos | Optional original two-pass Lanczos-3 in OpenGL 3.3 | Actual NVIDIA GTX 1660 Ti render context recorded, SDR quality tests and native source streams. AMD/Intel renderer qualification and macOS/Linux builds remain open. |
| CPU Lanczos | Optional experimental 8-bit SDR libswscale reference | Functional 1080p/4K pixels and source-matched streams. Prior measured service 143–219 ms exceeds 30 fps. |

## Media compatibility

The fixture matrix covers H.264 MP4/MKV, H.265 MP4, MJPEG AVI and ProRes MOV; separate H.264 1920×1080 and 3840×2160 clips cover resolution handling. Supported files decode locally without mandatory pre-conversion. This does not establish every codec, profile, bit depth, chroma subsampling, HDR/alpha mode or damaged-file behavior. MP4, MOV, MKV and AVI are containers, not guarantees about the codec within them. Unsupported incoming media reports an error and preserves the current Program.

## Resolution and quality

Fullscreen uses the selected display's current desktop mode and device pixel ratio. The app does not change the OS mode. Matching 16:9 3840×2160→1920×1080 reduces the image; the reverse enlarges it. Other ratios fit with black bars, preserving geometry. Originals are never modified.

In Outputs, choose Native, Lanczos CPU or Lanczos GPU, then Open output. Reopen to apply a changed profile. Native remains recommended for live operation while GPU output is qualified on each machine. GPU Lanczos widens its filter on reduction to suppress aliasing. It filters gamma-encoded RGB, with a floating-point intermediate and an 8-bit output. It does not reconstruct missing source detail or guarantee the best appearance for all content.

GPU resource bounds: dimensions up to 4096, output area at most 4096×2160, reduction at most 4:1 per axis. High-depth, HDR, rotated/mirrored/cropped and subtitle-bearing frames retain Native. A failed/unavailable GPU context or shader/resource error warns and falls back to Native; Programs keep running. Known software renderer names are rejected by the GPU scaler. CPU decoding can still be combined with GPU scaling; decode and presentation are separate stages.

## Copies, mirrors and timing

The GPU path still calls QVideoFrame.toImage to obtain/upload input pixels. Hardware-decoded frames may require GPU-to-CPU readback: this is not zero-copy. A per-Program input cache shares that conversion across mirrored GPU outputs. Each output currently owns its own textures/filter passes, supporting different output sizes. Scaled textures stay on the GPU for production presentation. Pixel QA alone reads the resulting texture back.

Only the latest pending surface frame is retained. Overload supersedes video frames rather than building an unbounded queue. CPU Lanczos retains one worker plus one newest pending frame and shares its scaled result with equal-size mirrors. Neither queue policy proves AV synchronization.

The GPU QA suite checks nonuniform identity/orientation, reduction aliasing, analytic wave reconstruction, resource/fallback behavior and actual 1080p/4K framebuffer pixels. Measurements use four-second native H.264 streams after warmup. CPU service includes input readback/conversion, upload and submission. Async GL queries measure the two filter passes separately. Those times overlap and are not full playback/scanout latency.

The development desktop reports SONY TV at 1920×1080 / 60 Hz. A large off-desktop 3840×2160 framebuffer proves 4K rendering size, not a physical 4K output or synchronized multiple monitors. Long shows, AV sync, physical output signal quality, HDR/color/alpha and vendor-specific hardware decode profiles remain open.

## Local GPU measurements

Final build v0.6.3 (build 0016) used NVIDIA GeForce GTX 1660 Ti / OpenGL 3.3 NVIDIA 591.74. Each row measures a four-second native H.264 stream after warmup, with actual framebuffer size verified.

| Decoder mode | Source → framebuffer | GPU filter median | CPU service median / p95 | Distinct rendered fps |
| --- | --- | --- | --- | --- |
| auto | 4K to 1080p | 1.66 ms | 25.38 / 34.23 ms | 27.75 |
| auto | 1080p to 4K | 2.36 ms | 7.13 / 9.99 ms | 29.74 |
| cpu | 4K to 1080p | 1.68 ms | 20.57 / 23.58 ms | 28.75 |
| cpu | 1080p to 4K | 2.31 ms | 5.92 / 7.46 ms | 29.75 |

GPU and CPU service times overlap; do not add them or equate either with full latency. Automatic 4K reduction still superseded frames, so this result is not an unqualified 30 fps claim. Input readback/upload is the next optimization target; Native remains the live recommendation. See [automatic results](../evidence/gpu-auto-0016.json) and [CPU-decoder results](../evidence/gpu-cpu-0016.json).

The nonuniform 1:1 pattern retained exact channels/orientation. A 2:1 checkerboard reduction differed from neutral gray by at most 1/255 away from borders. On the analytic 2× wave enlargement test, MSE was 0.22054 for GPU Lanczos versus 5.46294 for Qt Smooth. This synthetic result supports that specific reconstruction case, not a universal perceptual ranking. [Pixel comparison](../evidence/gpu-quality-proof.png).

## Primary references

[Qt FFmpeg backend selection](https://doc.qt.io/qt-6.10/advanced-ffmpeg-configuration.html), [Qt video widget](https://doc.qt.io/qt-6.10/qvideowidget.html), [Qt OpenGL widget lifecycle](https://doc.qt.io/qt-6.10/qopenglwidget.html), [FFmpeg 7.1 resampler API](https://ffmpeg.org/doxygen/7.1/group__libsws.html). These describe interfaces and capabilities; repository measurements establish the narrower current validation scope.
