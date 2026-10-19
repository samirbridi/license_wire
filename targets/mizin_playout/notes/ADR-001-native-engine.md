# ADR-001 — Native vertical slice

Date: 2026-10-19. Status: selected for the first prototype; performance architecture remains measurable and replaceable.

## Decision

C++20 + Qt 6.10.2 Widgets + Qt Multimedia's native FFmpeg backend. No WebEngine, browser video, local HTTP player or mandatory conversion. Qt owns demux/decode/audio/frame presentation; NativeChannel exposes deck preparation, transport and shared-frame signals to the operator and output widgets.

Qt's FFmpeg deployment is available as a target-private SDK. GStreamer remains a candidate for advanced composition, clocks and transitions; it has not been benchmarked against this implementation. Selecting Qt for this executable does not establish that it is the final best-performing backend.

## Constraints

- Each Program has two native decks. Incoming media is muted during preroll; current Program remains until a video frame or audio-only readiness arrives.
- Preview is a separate paused/muted channel. Mirroring forwards implicitly shared QVideoFrame objects to QVideoWidget sinks. The normal cut path introduces no application QImage conversion. ADR-002 adds CPU image conversion only during transitions. Backend GPU interop and actual copies still need instrumentation.
- Two independent logical Programs are present. This is a bounded proof, not the final output count.
- Qt hardware selection is automatic. CPU mode sets QT_FFMPEG_DECODING_HW_DEVICE_TYPES to an empty device list before backend construction. This is a private Qt configuration API: version pinned; retest when upgrading.
- A GPU decoder logo or utilization number is not displayed without measured evidence. CPU mode means software decoding, not necessarily software presentation.
- Windows is the first compiled target. Source uses portable Qt APIs; Linux/macOS compatibility is not yet a tested deliverable.
- Remote, scheduler, GPU/HDR/alpha composition and per-device audio routing remain future work. A CPU dissolve/fade reference path, trims and sequential playback were subsequently implemented in ADR-002.

## Sources

- [Qt Multimedia](https://doc.qt.io/qt-6/qtmultimedia-index.html)
- [FFmpeg backend configuration](https://doc.qt.io/qt-6/advanced-ffmpeg-configuration.html)
- [QVideoSink](https://doc.qt.io/qt-6/qvideosink.html)
- [QVideoFrame](https://doc.qt.io/qt-6/qvideoframe.html)
