# ADR-017 — Local WebRTC monitor (view only)

Date: 2026-10-21. Status: accepted direction, not implemented. Follows ADR-016.

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
