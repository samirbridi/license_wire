# ADR-018 — Low-latency audio: ASIO and WASAPI exclusive

Date: 2026-10-21. Status: implemented 2026-10-22 (WASAPI shipped; ASIO built only with -DMIZIN_ENABLE_ASIO=ON). Follows ADR-017.

## Context

Local monitoring now goes through `QMediaPlayer` → `QAudioOutput` (Qt, WASAPI shared mode). Its buffer
size is controlled by Qt, not by us, and only stereo endpoints are addressable. Devices on the operator
machine (2026-10-21 registry): Blackmagic ASIO Driver, Dante Virtual Soundcard (x64) ASIO, UMC ASIO
Driver (Behringer), plus Realtek/Intel/NVIDIA HDMI endpoints. The user wants all of them usable.

## Decision

Add an application audio engine that owns the local output instead of Qt's sink:

- Source: the existing per-Program 48 kHz float mix (ADR-006 ring/mixer with fades, gain, mute). The
  Qt local `QAudioOutput` is muted when the new engine owns the device; network paths are unchanged.
- Backends:
  1. **ASIO** (Dante VSC, UMC, Blackmagic): one driver open per process, buffer size from the driver
     (target 64–256 samples), sample-rate follows the driver (48 kHz expected; resample otherwise).
     Each Program is routed to a selectable channel pair (e.g. Program A → 1/2, B → 3/4), which is the
     main gain for Dante (many channels) and Blackmagic embedded audio.
  2. **WASAPI exclusive / IAudioClient3 low-latency shared** for the built-in and HDMI outputs when no
     ASIO driver is wanted. No licence needed.
  3. Existing Qt path stays as the safe fallback.
- Licensing: the Steinberg ASIO SDK cannot be redistributed freely in a closed application. Before
  coding the ASIO backend, the Steinberg ASIO SDK licence agreement must be accepted by the owner
  (or the GPLv3 option, which would affect the whole app). The SDK is not committed to Git; it is loaded
  from `binaries/` like other SDKs and recorded in THIRD_PARTY.md.
- AV sync: lowering audio latency changes lip-sync relative to video presentation. Add a per-output
  audio delay (ms) and measure with a flash/beep fixture; report the measured audio and video latency in
  Engine diagnostics. Underruns/xruns are counted and shown.
- The audio callback never locks the GUI, allocates, or waits on decoders: it only reads the bounded
  ring prepared by the mixer thread.

## Validation targets

Round-trip/output latency per backend and buffer size, xrun count over a long run, Program→channel
routing on Dante (Dante Controller) and UMC, device unplug/replug, driver sample-rate change, mute/fade
parity with the network mix, AV-sync offset with the fixture.

## Implementation notes (2026-10-22)

- `LocalAudioEngine` (src/local_audio.*): render core pulls each routed Program with the new thread-safe,
  allocation-free `NativeChannel::mixLocal` (ring guarded by a recursive mutex; GUI envelope edits take the
  same guard). Per route: delay = max(adaptive headroom 10–120 ms, video publication lag + operator offset −
  device latency). Drift: ±1 sample per callback above 2 ms error, hard re-anchor above 50 ms.
- `NativeChannel::videoLagUs` is an EMA of (publish time − audio-timeline tag) of each published frame.
- Qt sinks stay running muted while the engine owns output (they keep the player clock). Engine stop or
  backend failure (device removed, ASIO reset) returns every Program to Qt output.
- WASAPI exclusive: event-driven, device minimum period (or requested frames), float32/int32/24-in-32/int16,
  MMCSS "Pro Audio". WASAPI shared: IAudioClient3 minimum engine period, fallback to auto-convert shared.
- ASIO (src/local_audio_asio.cpp): Steinberg SDK 2.3.4 host code built as `mizin_asio` without UNICODE;
  48 kHz required; Int16/24/32 (+LSB16..24) and Float32/64 LSB outputs. The SDK lives in ignored
  binaries/asio-sdk. **Proprietary licence: a Steinberg-signed agreement is required before publishing a
  closed-source build**, so official builds keep MIZIN_ENABLE_ASIO OFF; `--runtime-info` reports `asio`.
- UI: Audio → Low-latency output (engine, device, buffer, sync, fine adjust, start-at-launch, per-Program
  output pair). Settings under `localAudio/*`.

Measured 2026-10-22 (dev build, VB-Audio Cable loopback, this PC): WASAPI exclusive 96 frames = 2.0 ms
buffer / 4.0 ms device latency, audio captured; WASAPI shared low-latency 280 frames = 5.8 ms; render core
max 0.09 ms per callback. ASIO drivers enumerated (Blackmagic, Dante VSC, UMC) but none streamed: no
DeckLink present, Dante VSC not started, UMC not connected. Physical AV-sync with a camera/flash-beep
fixture is still to be measured.
