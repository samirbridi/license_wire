# Compatibility, GPU use and output resolution

Validated scope: Windows prototype, Qt 6.10.2 / native FFmpeg 7.1.2. The exact build, fixtures, hashes and checks are in [validation.json](../evidence/validation.json).

| Stage | Current behavior | Qualification |
| --- | --- | --- |
| Decode | Automatic hardware selection or forced CPU decoding | Existing H.264/H.265 samples selected D3D11VA in diagnostic logs. The decoder adapter is not identified by those logs. |
| Native presentation/scaling | Shared QVideoFrame fitted by QVideoWidget | Default for live use. Detected desktop fullscreen geometry verified; physical signal/visual/sync qualification remains open. |
| Transitions | Shared CPU image compositor per Program | Functional Cut/Dissolve/Fade tests; GPU scaling does not move this composition to the GPU. |
| GPU Lanczos | Optional original two-pass Lanczos-3 in OpenGL 3.3 | Actual NVIDIA GTX 1660 Ti render context recorded, SDR quality tests and native source streams. AMD/Intel renderer qualification and macOS/Linux builds remain open. |
| Program audio | Independent native local routes, master/mute and stereo 48 kHz network mix | Real decoded PCM and device/control tests. Physical listening remains open. |
| Digital AV | NDI SDK 6.3.2 (installed runtime) and OMT v1.0.0.19 (packaged Native AOT) | Both SDK receivers returned 1080p video and stereo audio; mute/unmute/Black checked. Strict NDI receiver video timestamp monotonicity failed intermittently, reproduced in build 0026; see [ISSUE-001](../notes/ISSUE-001-ndi-receiver-timestamps.md). Same process/machine only; network regression is not fully green. |
| CPU Lanczos | Optional experimental 8-bit SDR libswscale reference | Functional 1080p/4K pixels and source-matched streams. Prior measured service 143–219 ms exceeds 30 fps. |

One Program and one display route are configured by default. Add Programs for independent playlists and extra routes for mirrors. The former 2/3 limits are removed; the current functional scenario is three Programs / five floating routes. Allocation guards are 64 Programs / 128 routes, not hardware capacity ratings. See [event output configuration](../notes/ADR-010-dynamic-programs-and-playlists.md).

Current **v0.11.1 (build 0030)** UI validation includes five visible Program tiles and all-Program Outputs inventory with one display route, in EN/PT-BR at 1600x1000 and 1280x800. Tile views reuse existing frame publications and allocate no decoders. Larger grids scroll. 110 native UI checks passed; overall 390/390 checks passed with all observed network failures retained. This is layout/functional evidence, not a new GPU/maximum-concurrency benchmark. [Stage record](../evidence/multiview-0030.md).

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

Final build v0.7.3 (build 0020) used NVIDIA GeForce GTX 1660 Ti / OpenGL 3.3 NVIDIA 591.74. Each row measures a four-second native H.264 stream after warmup, with actual framebuffer size verified.

| Decoder mode | Source → framebuffer | GPU filter median | CPU service median / p95 | Distinct rendered fps |
| --- | --- | --- | --- | --- |
| auto | 4K to 1080p | 1.66 ms | 26.38 / 35.64 ms | 27.09 |
| auto | 1080p to 4K | 2.31 ms | 6.69 / 11.73 ms | 29.16 |
| cpu | 4K to 1080p | 1.69 ms | 21.67 / 30.66 ms | 28.22 |
| cpu | 1080p to 4K | 2.31 ms | 5.87 / 7.57 ms | 29.49 |

GPU and CPU service times overlap; do not add them or equate either with full latency. Automatic 4K reduction still superseded frames, so this result is not an unqualified 30 fps claim. Input readback/upload is the next optimization target; Native remains the live recommendation. See [automatic results](../evidence/gpu-auto-0020.json) and [CPU-decoder results](../evidence/gpu-cpu-0020.json).

The nonuniform 1:1 pattern retained exact channels/orientation. A 2:1 checkerboard reduction differed from neutral gray by at most 1/255 away from borders. On the analytic 2× wave enlargement test, MSE was 0.22054 for GPU Lanczos versus 5.46294 for Qt Smooth. This synthetic result supports that specific reconstruction case, not a universal perceptual ranking. [Pixel comparison](../evidence/gpu-quality-proof.png).

## Digital AV and audio scope

The final package passed the audio/network suite in both decoder modes with native NDI and OMT receivers on this machine. The fixture is 1080p/30 H.264 with stereo AAC at 48 kHz. Both receivers returned nonzero stereo PCM and increasing video timestamps, then silence/return of audio under master mute/unmute and black pixels on Black. Starting/stopping publishers and the independent Program B path were checked. These facts do not establish independent application interoperability, LAN discovery across network equipment, physical sound or production AV sync. [Automatic results](../evidence/network-auto-0020.json), [CPU results](../evidence/network-cpu-0020.json).

Local output selection detected Realtek, NVIDIA HDMI and virtual audio endpoints. Gain/mute apply to both local/network Program audio; local monitor enable and network Include audio are independent gates. Preview remains muted. Network format is stereo float32 48 kHz and 8-bit SDR. Black preserves the last stream size/cadence. Missing selected audio endpoints mute locally; absent NDI/OMT/VMX dependencies report an error before starting a sender. Installing a missing runtime requires restarting this version.

This initial IP path performs one frame readback/conversion per Program and uses SDK worker threads for compression/sending. It makes no GPU encoding or 4K network throughput claim. Video queues hold up to six frames and audio queues twenty 10 ms packets per sender; overload may drop/supersede data. The mix/video headroom is 40 ms and has not been physically calibrated. Multichannel mapping, exclusive ASIO, manual delay offsets, HX and HDR network output are outside this milestone. Remote operator control remains separate future work.

## Primary references

[Qt FFmpeg backend selection](https://doc.qt.io/qt-6.10/advanced-ffmpeg-configuration.html), [Qt video widget](https://doc.qt.io/qt-6.10/qvideowidget.html), [Qt OpenGL widget lifecycle](https://doc.qt.io/qt-6.10/qopenglwidget.html), [FFmpeg 7.1 resampler API](https://ffmpeg.org/doxygen/7.1/group__libsws.html). These describe interfaces and capabilities; repository measurements establish the narrower current validation scope.
