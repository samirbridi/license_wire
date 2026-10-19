# Reproduce the native functional checks

Generate the five synthetic 640×360, 30 fps, three-second fixtures with scripts/make-fixtures.ps1 and a QA-only FFmpeg executable. No user media is needed.

Run the compiled application with:

```powershell
& '.\dist\MizinPlayout.exe' --smoke-test --fixtures '.\binaries\fixtures' --result '.\evidence\smoke-auto.json'
& '.\dist\MizinPlayout.exe' --cpu --smoke-test --fixtures '.\binaries\fixtures' --result '.\evidence\smoke-cpu.json'
```

The runner requires actual valid frames, advancing media position and duration for each file. It then starts different files on two native Programs and forwards the same primary frames to two QVideoSink consumers. A deliberately invalid incoming file must report an error while the original Program continues producing frames. Programs use loop in this last phase so natural end-of-file cannot be confused with a continuity failure. Results report counts and errors. A PASS establishes native decode/timing and functional channel/frame sharing at this small fixture size; it does not qualify 1080p/4K, presentation, audio sync, physical monitors or long-duration stability.

Qt backend logging can be enabled for diagnosis with MIZIN_LOG_PATH pointing to a local log file, QT_FFMPEG_DEBUG=1 and QT_LOGGING_RULES=qt.multimedia.ffmpeg.*=true before launch. Verbose trace logging adds overhead and must not be used as a performance measurement. Automatic selection is a configuration, not proof of which GPU vendor decoded each stream. CPU mode explicitly disables decoding hardware devices; presentation may still use the GPU.

For interface review, run scripts/capture-boards.ps1 and inspect all four PNGs, then inspect the running native window. English/PT-BR catalog keys must match. Language switching should preserve the media model and channel objects. Test import, cue, take, output open/close and save/open separately in the real UI.

Before a production claim: validate physical output routing/hotplug, codec profiles/bit depths, audio devices/A-V sync, 1080p/4K load, transitions, memory growth and 24/72-hour behavior on each supported platform/GPU.
