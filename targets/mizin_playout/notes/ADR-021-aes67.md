# ADR-021 — AES67 network audio

Date: 2026-10-22. Status: implemented (owner: "vamos preparar o AES67"), while native Dante waits for Audinate (ADR-020).

## Design
- New LocalAudioEngine backend `Aes67` (same routing, per-Program pairs and video sync as WASAPI/ASIO).
- Transmit only: RTP, L24 big-endian, 48 kHz, 1 ms packets (48 frames), up to 8 channels per stream, up to 64 channels
  (8 streams on consecutive multicast addresses, default 239.69.<host>.<n>, port 5004, TTL 32).
- RTP timestamp = PTP time in samples (mediaclk:direct=0). The sender wakes every 1 ms (high-resolution waitable
  timer, MMCSS "Pro Audio") and sends every packet whose timestamp is due (up to half a packet early).
- SAP (239.255.255.255:9875) announces each stream every 30 s and on grandmaster changes, with SDP: rtpmap
  L24/48000/n, ptime 1, ts-refclk ptp=IEEE1588-2008:<GM>:<domain>, mediaclk:direct=0, recvonly; deletion on stop.
- PTPv2 ordinary clock (E2E, multicast 224.0.1.129, ports 319/320, software timestamps): best-master comparison with
  a low-priority own dataset (priority 250, class 248). Auto = follow the best foreign master, become grandmaster after
  3 s without one; SlaveOnly/MasterOnly for special cases. Servo: lucky-packet filter in both directions
  (offset = (max(t1-t2) + min(t4-t3)) / 2), rate by least squares over ~16 s, phase corrected by 1/4 per Sync,
  step above 2 ms.
- Engine latency reported to the video sync = receiver latency + 1 packet.
- Windows does not apply DSCP from IP_TOS; QoS (DSCP 46 audio / 56 PTP) is left to network policy.

## Validation (this computer, multicast loopback)
- `--aes67-test`: SDP/SAP format, PTP slave lock (time error tens of µs, rate within a few ppm), best-master and
  take-over, 1000 packets/s without gaps, routed audio only on its channels, second stream above 8 channels, RTP
  timestamps within ±0.3 ms of PTP time, SAP announce/withdraw, audio continues after the Program loops.
- Independent receiver: ffmpeg 8.1 found the stream through SAP and decoded L24/48 kHz/8 ch with the tone on
  channels 1–2 only.
- Pending: Dante hardware / Dante Controller interoperability on the owner's network.

## Found on the way
- After a loop wrap or seek, the audio timeline was anchored at the request time; when the player took ~250 ms to
  resume, every new buffer looked stale and Program audio stayed silent (local engine, NDI/OMT and web monitor).
  Decks now re-anchor on the first buffer from the seek target, never in the past.
