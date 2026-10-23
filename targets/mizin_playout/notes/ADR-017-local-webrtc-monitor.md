# ADR-017 — Local WebRTC monitor (view only)

Date: 2026-10-21. Status: implemented 2026-10-22 (see Implementation notes). Follows ADR-016.

## Decision

An opt-in **Web monitor** lets any browser on the same network (phone, tablet, another PC) open a page
served by the app, see the list of available Programs and watch each one live with low latency. It is
**view only**: no CUT/FADE, no settings. Remote control stays a separate, authenticated milestone
(release-roadmap "Authenticated remote operation").

## Design

- Off by default; never restored automatically at launch (same rule as NDI/OMT senders). Settings choose
  the network interface and port; "localhost only" is available.
- Access requires a random code shown in the app (URL `http://<ip>:<port>/?k=<code>` plus QR code).
  The code can be regenerated, which disconnects viewers. Viewer count is shown on the dashboard.
- HTTP + signaling on `Qt6::Network` (`QTcpServer`), already linked: GET page/assets, POST SDP offer →
  answer with all ICE candidates (non-trickle), so no WebSocket module is needed. Host candidates only
  (LAN); no STUN/TURN or Internet exposure.
- WebRTC stack: **libdatachannel** (MPL-2.0, C++17, small) with its H.264 RTP packetizer and Opus track.
  Google libwebrtc is rejected (size/build cost). The browser side is a plain HTML/JS page compiled
  into resources (no framework).
- Video: one encoder per watched Program (not per viewer), started on first viewer and stopped after the
  last leaves. Constrained Baseline H.264, no B-frames, short GOP / keyframe on new viewer, 720p30 default
  (1080p optional), CBR. The shipped LGPL FFmpeg has `h264_mf` (Media Foundation → GPU MFT) and no
  NVENC: first implementation uses `h264_mf` with low-latency settings; adding `--enable-nvenc`/AMF
  (MIT headers, LGPL-compatible) to the FFmpeg rebuild is a measured follow-up. No x264 (GPL).
- Audio: the existing per-Program 48 kHz stereo mix tap (ADR-006), encoded to Opus 20 ms (FFmpeg native
  `opus` encoder is present; libopus would be better quality — evaluate).
- Frames reuse the NetworkBus conversion path (BGRA at source size) with a scaler to the web size; it
  must never block the Program or the GUI thread. Bounded queues; drops are counted in diagnostics.

## Validation targets

Latency glass-to-glass on LAN (goal < 300 ms, measured with a timecode fixture), CPU/GPU cost per watched
Program, multiple viewers on one encoder, viewer leave/rejoin, wrong/expired code rejected, server off by
default, nothing listening when disabled (port check). Browsers: Chrome/Edge desktop, Safari iOS,
Chrome Android.

## Implementation notes (2026-10-22)

- Dependencies are built from pinned sources by `scripts/build-web-sdk.cmd` into ignored `binaries/web-sdk`
  (libdatachannel v0.24.6 + submodules, Mbed TLS v3.6.7 with `MBEDTLS_SSL_DTLS_SRTP`, Opus v1.5.2).
  `datachannel.dll` ships beside the app; notices/commits in `packaging/notices/webrtc-monitor`.
- Video: Windows Media Foundation **software** H.264 MFT (`CLSID_CMSH264EncoderMFT`), Baseline, CBR
  3.5 Mb/s, low-latency mode, GOP 2 s, forced IDR on viewer join/PLI, 1280×720 letterboxed, <= 30 fps.
  The shipped FFmpeg has no development files, so `h264_mf`/NVENC through FFmpeg was not used.
  A hardware (async) MFT path is a measured follow-up.
- Audio: Program mix tap (ADR-006) → Opus 20 ms, 128 kb/s stereo; the page munges its answer to
  `stereo=1` so browsers do not downmix.
- Signaling: server offer, browser answer, non-trickle over two POSTs; `playout-delay` header
  extension 0–100 ms asks the browser for minimum buffering. Host candidates only, UDP 50200–50399;
  "This computer only" binds HTTP and ICE to 127.0.0.1.
- Access: 8-char code (persisted per machine, "New code" disconnects everyone), 20 wrong codes per
  minute → 429, 16 viewers max, no control endpoint exists.
- Paused/black Programs repeat the last picture at 2 fps so joining viewers still get a keyframe.

Measured (dev build, same PC, built-in Chromium browser pane): 1280×720 at 29 fps decoded, video
jitter buffer 4–21 ms, audio jitter buffer ~57 ms, Opus negotiated stereo. Glass-to-glass latency on
a real LAN/phone is not yet measured.

## Quality and hardware encoding (2026-10-22, owner request)
- Quality per server, live: 0 automatic = the Program's source size, at most 1920x1080 (smaller sources keep their size,
  even dimensions, minimum 320x180); 1 = 720p, 2 = 1080p, 3 = 2160p, letterboxed in that box. The worker reopens the
  encoder when the size or quality changes and forces a keyframe (new SPS); browsers follow the change on the same track.
- Bitrate = 0.12 bit/pixel at 30 fps, clamped 1.5–25 Mbit/s. SDP offers Constrained Baseline level 5.1 (42e033).
- Encoder: Media Foundation hardware MFT (async events; NVENC/Quick Sync/AMF) first, software MFT fallback. A hardware
  encoder that fails or does not produce Baseline (profile_idc 66) is replaced by the software one automatically.
  `MIZIN_WEB_SOFTWARE_ENCODER` forces software for diagnostics.
- RGB→NV12 conversion runs in row bands over up to 8 cores; a source already at the stream size skips the scaling pass.
- Measured on this computer (NVIDIA laptop, loopback viewer, frame conversion + encode): 1080p 11.5 ms NVENC / 24 ms
  software; 2160p 44 ms NVENC (about 22 fps) / 108 ms software. Full 4K30 needs the conversion on the GPU (next step).
