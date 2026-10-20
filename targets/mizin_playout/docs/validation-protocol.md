# Reproduce the native functional checks

Generate the five synthetic 640×360, 30 fps, three-second fixtures with scripts/make-fixtures.ps1 and a QA-only FFmpeg executable. No user media is needed.

Run the compiled application with:

```powershell
& '.\dist\MizinPlayout.exe' --smoke-test --fixtures '.\binaries\fixtures' --result '.\evidence\smoke-auto.json'
& '.\dist\MizinPlayout.exe' --cpu --smoke-test --fixtures '.\binaries\fixtures' --result '.\evidence\smoke-cpu.json'
& '.\dist\MizinPlayout.exe' --transport-test --fixtures '.\binaries\fixtures' --result '.\evidence\transport-auto.json'
& '.\dist\MizinPlayout.exe' --cpu --transport-test --fixtures '.\binaries\fixtures' --result '.\evidence\transport-cpu.json'
# Use a new portable state directory per UI run to check the 300 ms default.
$uiStateCpu = Join-Path '.\binaries' ('qa-ui-cpu-' + [Guid]::NewGuid().ToString('N'))
$uiStateAuto = Join-Path '.\binaries' ('qa-ui-auto-' + [Guid]::NewGuid().ToString('N'))
& '.\dist\MizinPlayout.exe' --cpu --ui-test --lang en --fixtures '.\binaries\fixtures' --state-dir $uiStateCpu --result '.\evidence\ui-cpu.json'
& '.\dist\MizinPlayout.exe' --ui-test --lang en --fixtures '.\binaries\fixtures' --state-dir $uiStateAuto --result '.\evidence\ui-auto.json'
```

The runner requires actual valid frames, advancing media position and duration for each file. It then starts different files on two native Programs and forwards the same primary frames to two QVideoSink consumers. A deliberately invalid incoming file must report an error while the original Program continues producing frames. Programs use loop in this last phase so natural end-of-file cannot be confused with a continuity failure. Results report counts and errors. A PASS establishes native decode/timing and functional channel/frame sharing at this small fixture size; it does not qualify 1080p/4K, presentation, audio sync, physical monitors or long-duration stability.

Qt backend logging can be enabled for diagnosis with MIZIN_LOG_PATH pointing to a local log file, QT_FFMPEG_DEBUG=1 and QT_LOGGING_RULES=qt.multimedia.ffmpeg.*=true before launch. Verbose trace logging adds overhead and must not be used as a performance measurement. Automatic selection is a configuration, not proof of which GPU vendor decoded each stream. CPU mode explicitly disables decoding hardware devices; presentation may still use the GPU.

The transport suite checks schema-2 round trips, schema-1 migration, duplicate file references, atomic rejection of malformed shows, numeric bounds, actual compositor pixels, exclusive In/Out video frame timestamps, manual hold, standalone entry/exit fades, sequential dissolve/fade-black, pause/resume, invalid Out continuity, trimmed-range loop, failed-next-item stop, one-item playlist repeat, manual CUT bypass, default/configured FADE and preserving cue settings for repeated playback. It runs the same native channel/controller code as the interface. Pixel checks establish the CPU mix math, not color-managed/HDR or sample-accurate audio output. The 10 ms boundary timer and backend seeking require further production timing qualification.

The in-process UI suite clicks the real Qt buttons with native fixture playback: MAIN/EDIT separation, 300 ms default, CUT bypass, editor/Program continuity, FADE using applied cue metadata, live snapshot preservation, destination B, duration persistence and language switching. It exercises widget actions without OS pointer automation and does not prove physical monitor presentation.

For interface review, run scripts/capture-boards.ps1 and inspect all six PNGs, then inspect the running native window. English/PT-BR catalog keys must match. Language switching should preserve the media model and channel objects. Test import, cue, take, output open/close and save/open separately in the real UI.

Builds use a clean MSVC/NMake compilation because localized include-dependency scanning omitted changed headers in an earlier incremental build. Every compilation still advances the generated build counter. Earlier diagnostic logs and failed iterations are retained; the validation manifest identifies the package and results that constitute the current milestone.

Before a production claim: validate physical output routing/hotplug, codec profiles/bit depths, audio devices/A-V sync, 1080p/4K load, transitions, memory growth and 24/72-hour behavior on each supported platform/GPU.

## Resolution-specific checks

Generate additional synthetic two-second H.264 clips with scripts/make-resolution-fixtures.ps1 -FFmpeg <QA-tool-path>. They live separately under binaries/resolution-fixtures, preserving the original five-file matrix. Run --output-test --fixtures binaries/resolution-fixtures --result evidence/output-auto.json, with --cpu for software decode.

This suite checks physical/DIP pixel math, 4K/1080p aspect fitting, actual Lanczos output pixels, shared mirrored frames, bounded pending work, stale-frame invalidation, high-depth/transformation fallback, feed cleanup, native 4K H.264 frames, detected-screen fullscreen geometry, output close continuity, and actual source-matched downscale/upscale frames. A test PASS means functional behavior, not an acceptable live frame rate. Current CPU Lanczos 4K processing exceeds the 30 fps budget and is marked experimental. The screen detected by Qt is recorded; this does not establish visual approval, physical signal integrity or hotplug qualification.

## GPU scaler checks

Run `--gpu-test --fixtures binaries/resolution-fixtures --result evidence/gpu-auto-<build>.json`; add `--cpu` for a separate software-decoder run. Do not enable verbose codec tracing while measuring performance. This suite records actual GL_VENDOR/GL_RENDERER/GL_VERSION rather than inferring a scaler adapter from a decoder log.

The suite verifies shader compile/link, nonuniform 1:1 pixels/orientation, checkerboard reduction antialiasing, analytic sinusoid enlargement error versus Qt Smooth, actual 1080p/4K pixels, resource bounds, shared input readback, independent Program caches, route framebuffer pixels, latest-frame coalescing, black/rotation/high-depth/native fallback, GPU recovery and native streaming in both resolution directions. Fixed QA surfaces and a framebuffer readback confirm actual pixel sizes before throughput collection. A large off-desktop framebuffer does not establish a physical 4K monitor. The first hidden-launched route's framebuffer is explicitly rendered for pixel QA.

Report CPU readback/upload/submission service and asynchronous GPU filter query times separately; neither alone is full playback latency. The four-second streams report distinct rendered/source frame counts and superseded updates. Frame rates and p95 service costs are measurements, not universal performance guarantees. AV sync, long shows, hardware vendors and operating systems still require their own qualification. Pixel QA readback is separate from production texture presentation.

## Audio and digital-output checks

Run `--network-test --fixtures binaries/network-fixtures --result evidence/network-<mode>-<build>.json`; add `--cpu` for software video decoding. The extra generated fixture is eight seconds of H.264 1920×1080/30 with stereo AAC at 48 kHz (440 Hz left, 880 Hz right). Its hash is separate from the preserved original fixtures.

The suite checks master gain, mute, clipping, stereo-planar layout, ring wrap/flush, sample-time fades, pause phase, exclusive Out, real decoded PCM, Preview silence, missing/default audio devices, seek/pause/resume, monotonic audio timestamps, missing runtime/codec handling, default-off senders, simultaneous NDI/OMT, independent Program B, and Stop preserving the Program. Native SDK receivers must actually return 1080p video and nonzero stereo audio with increasing video timestamps. Additional checks verify mute/unmute and black pixels at both receivers, not only sender counters.

The new Audio page is also covered by native UI actions/persisted preferences and translated captures. Endpoint enumeration/configuration does not prove physical listening. A same-process SDK loopback does not qualify a separate receiver application/PC, switch/firewall discovery, bandwidth, 4K digital throughput, multichannel/HX/HDR, AV synchronization or show-duration stability. Record those boundaries explicitly before making production claims.
