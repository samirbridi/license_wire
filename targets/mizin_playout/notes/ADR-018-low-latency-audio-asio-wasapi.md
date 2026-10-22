# ADR-018 — Low-latency audio: ASIO and WASAPI exclusive

Date: 2026-10-21. Status: accepted direction, not implemented. Follows ADR-017.

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
