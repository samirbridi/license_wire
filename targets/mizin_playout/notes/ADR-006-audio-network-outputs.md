# ADR-006 — Program audio and NDI / OMT outputs

Date: 2026-10-20. Status: local Windows validation passed at v0.7.3 (build 0020).

## Decision and operator controls

Add an Audio page with independent Program A/B master gain, mute, local-monitor enable and detected output-device selection. Keep Preview muted. Persist device IDs and controls as machine preferences. Missing selected devices mute local output instead of silently moving the sound to another endpoint. Restoring the device/default is separate from network audio.

Outputs now has Displays and Digital / IP tabs. Each Program has a source name, Include audio switch and separate Start/Stop buttons for NDI and OMT. Both protocols can run together alongside display routes. No network sender automatically starts from saved preferences or design previews. Output source names and audio inclusion are persisted; active transmission is not. Stopping a sender does not stop playback.

## Local audio and transport

QMediaPlayer keeps its two native QAudioOutput paths per Program. The existing transition envelope is multiplied by master gain. Mute/local-enable/device availability are independent gates. Local display mirrors do not instantiate additional audio players.

QAudioBufferOutput requests stereo float32 at 48000 Hz from each Program deck. Prepared/Preview buffers do not enter the Program mix. Samples are clipped to In/Out, assigned to a monotonic Program timeline and placed in fixed one-second per-deck rings with absolute sample tags. Mixing applies sample-time fade envelopes, master gain/mute and clipping. Network packets are 480-frame/10 ms interleaved blocks; adapters transpose them to planar float32 for the public SDKs. Peak meters show this Program mix, not a microphone or physical loopback measurement.

The mix reader has a 40 ms headroom. Pause/seek/black flush pending PCM, resume/seek reanchor media positions to the Program clock, and the packet clock continues monotonically. The reader limits catchup work and discards excessive backlog. These choices require AV-sync/listening qualification; a tap and sample-time model alone do not establish physical sync or seamless loop boundaries.

## SDK adapters and resource bounds

Use official public SDK headers and dynamic native-library loading. These are declared third-party dependencies, separate from the original product code. NDI loads from its official installed runtime (or an explicitly configured path); this local package does not redistribute or install the NDI binary. OMT release v1.0.0.19 supplies Native AOT libomt plus libvmx, deployed with the release's MIT notice. No .NET installation is required for that prebuilt native library. `scripts/setup-network-runtime.ps1` pins and verifies the upstream archive SHA-256.

Each sender owns a worker thread and native SDK instance. SDK compression/network calls run outside the GUI thread. Both protocols for a Program share one QVideoFrame→QImage conversion. Video is SDR BGRA at source size/cadence, bounded to dimensions 4096 and area 4096×2160. HDR transfer functions report a warning and send black; no HDR tone mapping is claimed. Initial blank output is 1280×720/30 black; later Black/audio-only output preserves the last stream size/cadence.

Up to six video frames and twenty 10 ms audio packets are queued per sender. The worker selects due frames with 40 ms video headroom and repeats the last image when paused/held. PTS use the Program's monotonic clock in each SDK's 100 ns units. Newest/due video supersedes older queued work; dropped audio/video counters remain available in diagnostics. This is bounded buffering, not a promise of lossless delivery under overload. The initial implementation converts/uploads on CPU and SDK codecs choose their own path; it makes no GPU network-encoding claim.

NDI clock_audio/clock_video are disabled because application timestamps/cadence drive submission. Synchronous SDK sends keep buffer ownership valid until each call completes. OMT send/receive are accessed through its native C ABI. Sender destruction joins the worker before destroying the instance. OMT settings/log storage is redirected to app-local state and its shutdown runs once after instances are destroyed.

The local QA suite uses a distinct eight-second H.264 1920×1080/30 file with 48 kHz stereo (440/880 Hz) and native receivers for both protocols. The suite must report received audio/video and actual runtime paths/versions, not only successful function calls. A same-machine SDK loopback does not prove discovery/routing across a switch/firewall, a separate receiving application, physical sound, show-duration stability or production AV sync.

## Interface references

- [Qt QAudioBufferOutput](https://doc.qt.io/qt-6.10/qaudiobufferoutput.html) and [QMediaPlayer audioBufferOutput](https://doc.qt.io/qt-6.10/qmediaplayer.html#audioBufferOutput-prop): format selection, decoded-buffer timing and the need to handle synchronization/flushing for external sinks.
- [NDI SDK licensing](https://docs.ndi.video/all/developing-with-ndi/sdk/licensing) and the installed MIT-licensed headers in reconstructed/third_party/ndi. NDI® is a registered trademark of Vizrt NDI AB.
- [OMT C wrapper](https://github.com/openmediatransport/libomt) and [pinned release](https://github.com/openmediatransport/libomtnet/releases/tag/v1.0.0.19).

## Integration commands

- `scripts/setup-network-runtime.ps1` verifies/downloads the pinned OMT dependency.
- `scripts/build.ps1` reserves the automatic version/changelog, compiles, deploys Qt and optional cached OMT runtime, then records compilation status.
- `dist/MizinPlayout.exe --network-test --fixtures binaries/network-fixtures --result evidence/network-<mode>-<build>.json` runs the local native suite; add `--cpu` to force software video decoding.
- `scripts/capture-boards.ps1` includes Audio EN/PT-BR and Digital / IP EN/PT-BR design boards.

## Iterations

Build 0017 compiled and passed 33 local audio/network checks plus 12 native UI checks in each decoder mode. Additional real-receiver mute/unmute/Black checks were added in build 0018. Mute/unmute passed; Black failed and remains recorded as FAIL in evidence/network-auto-0018.json. That test exposed valid frames arriving after a deck's source was cleared. The next source change rejects sink callbacks for empty cue/source state, keeps the local muted gate closed until configured gain is applied, and accounts for SDK setup time in the network clock. No failed result is relabeled PASS.

Build 0019 passed all 238 checks, including Black received by both SDKs with the native frame remaining invalid. Build 0020 additionally checks VMX presence before creating an OMT publisher and starts the sender clock before its worker is scheduled. The final package passed 240 functional checks: 38 audio/network and the 82 existing/media/UI/output/GPU checks in each decoder mode. All ten native boards and eight fixture hashes were verified. Production/physical/LAN qualification remains open as specified above.
