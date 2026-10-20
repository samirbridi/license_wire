# ADR-005 — Measured GPU SDR scaling

Date: 2026-10-20. Status: local Windows/NVIDIA validation passed at v0.6.3 (build 0016); Native remains the default.

## Decision

Add an optional `Lanczos · GPU (SDR)` profile per output. Use original C++/GLSL with Qt OpenGL public interfaces, without copying any reference project's implementation. The existing Native output and experimental CPU Lanczos reference remain available. Profile changes apply when opening/reopening a route.

The shader uses separable Lanczos-3. Reduction widens the kernel to suppress aliasing, bounded to a 4:1 ratio per axis. Horizontal intermediates are RGBA16F to retain signed filter lobes; the output is RGBA8. Filtering operates on gamma-encoded RGB. This is spatial reconstruction, not AI detail generation, sharpening or HDR tone mapping.

## Data flow and scope

1. NativeChannel continues to decode and own transport/audio. GPU scaling adds no decoder or audio stream.
2. Each GPU surface retains the latest incoming frame and coalesces superseded updates, rather than queueing video work without a bound.
3. A per-Program cache shares QVideoFrame-to-QImage conversion across mirrored GPU outputs. This can involve hardware-frame readback. This implementation is **not zero-copy**.
4. Each output uploads the input and executes two GPU filter passes at its fitted physical pixel size. Output textures remain on the GPU for presentation; production does not read the scaled image back into a QVideoFrame.
5. Matching mirrors share decode/input conversion. They currently have independent GPU textures/filter passes, allowing independent sizes and contexts; they do not share a resampled GPU texture.
6. Letterboxing and device pixel ratio are preserved. Native fullscreen screen selection remains unchanged. Closing an output does not stop the Program.

The GPU path requires a working desktop OpenGL 3.3 context. Vendor/renderer/version are recorded from the actual context, independently of the video decoder's adapter. Known software renderer names are rejected. This API choice is portable in source; only measured platforms/GPUs are validated.

High-depth, HDR, rotation/mirroring, cropped viewport and subtitle-bearing frames retain the Native presentation path. Context/shader/allocation/size failures report a warning and keep the route on Native until reopened. A failed incoming media file still follows NativeChannel's existing preservation behavior. Clear/black invalidates the queued GPU frame.

Current bounds: source dimensions and target dimensions at most 4096 on either axis, target pixel area at most 4096×2160, and reduction at most 4:1 per axis. These are explicit first-stage resource limits, not universal format support. Alpha/color/HDR/physical scanout remain unqualified.

## Measurements

- CPU service time: frame conversion/readback, upload and command submission on the GUI thread. This is not GPU execution time or glass-to-glass latency.
- GPU time: nonblocking `GL_TIME_ELAPSED` queries for the two filter passes. Results are collected only after `GL_QUERY_RESULT_AVAILABLE`; the render loop does not wait for a query.
- Playback throughput: distinct frames rendered over a bounded native playback interval, source frame count, superseded updates and actual framebuffer dimensions. This excludes physical scanout and does not establish AV sync or show-duration stability.
- Image tests: exact nonuniform 1:1 orientation/pixels, checkerboard antialiasing on reduction, analytic sinusoid reconstruction versus Qt Smooth on enlargement, and actual 1080p/4K resampled pixels.

`--gpu-test --fixtures <resolution-fixtures> --result <json>` runs the new suite. CPU and automatic decoder runs are separate: `--cpu` changes decoding, while the scaler can still use the GPU.

The first build (0013) compiled but crashed during destruction of the Qt timer wrapper in the offscreen QA renderer. A debugger stack was retained in `evidence/gpu-crash-0013.log`. The implementation now owns raw GL query objects and releases them explicitly in the active context. A compilation PASS alone is not functional validation.

## Primary interface references

- [Qt 6.10 QOpenGLWidget](https://doc.qt.io/qt-6.10/qopenglwidget.html): active-context lifecycle, default framebuffer and context sharing.
- [Qt 6.10 QVideoFrame](https://doc.qt.io/qt-6.10/qvideoframe.html): image conversion and frame metadata.
- [Khronos OpenGL 4.3 core specification](https://registry.khronos.org/OpenGL/specs/gl/glspec43.core.pdf): timer query availability and nanosecond results.

These references describe APIs. Repository measurements establish the narrower current validation scope.

Build 0014 passed the shader quality cases (nonuniform identity error 0, checkerboard error 1/255, sinusoid MSE 0.22054 versus Qt Smooth 5.46294), but the suite remained FAIL: the first hidden-launched QA window did not paint the injected sample (initially suspected to be a resize issue). The actual stream cases rendered, but ordinary top-level resize requests were constrained to the 1080p desktop; their JSON records those smaller dimensions. They are not 4K-output throughput evidence. Build 0015 adds fixed QA surface sizes, verifies actual framebuffer pixels and waits for output geometry before injecting a one-frame sample. No failed result is relabeled PASS.

Build 0015 confirmed exact 1920×1080 and 3840×2160 framebuffer pixels, but retained the first-window sample failure. The stream measurements are valid bounded runs at those sizes; the suite remained FAIL. The next QA change explicitly grabs/renders the first output framebuffer because a hidden-launched, non-exposed window may not get repaint events. The resulting pixel test is not a physical presentation claim.

Build 0016 confirmed `window_exposed: false` for that first hidden-launched route, and explicitly rendered its framebuffer. The red center pixel, black clear, burst coalescing and Native metadata fallback/recovery checks passed. This avoids treating a non-exposed QA window as a product rendering failure. All 21 GPU checks passed in automatic and CPU decoder modes; the entire package passed 160 functional checks.

Final measured automatic-decoder GPU filter medians were 1.66032 ms (4K→1080p) and 2.360832 ms (1080p→4K). CPU readback/upload/submission medians were 25.3788 ms and 7.1348 ms, with 27.75 and 29.7426 distinct frames/s over four seconds. Source counts were 120 in each window. These costs overlap; the filter timer cannot be substituted for end-to-end latency. Software decoding with GPU scaling also passed. Exact results are in gpu-auto-0016.json and gpu-cpu-0016.json. AMD/Intel GPUs, OS portability and physical 4K output remain untested.
