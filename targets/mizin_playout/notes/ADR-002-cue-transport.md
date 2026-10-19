# ADR-002 — Cue ranges, transitions and sequence

Date: 2026-10-19. Status: functional reference implementation validated with synthetic media.

## Decision

Store In/Out as non-destructive cue metadata with millisecond input. The decoder is prepared muted, waits for seekability and publishes its first included video frame before promotion. Keep a separate PlaylistController per Program. Manual is the default; sequential mode preloads one next cue and advances near Out according to the incoming transition duration. Repeat order supports one-item lists. Running orders are snapshots at TAKE; operator edits apply on the next TAKE.

Two live decks support Cut, Dissolve and Fade through black. Entry/exit fades support a standalone clip. Fade progression uses media timestamps, so pause freezes it; audio volume follows the envelope. Short ranges clamp fade durations. Prepared sequential transitions supersede the outgoing standalone exit fade. A late next item holds at the boundary; a failed next item blocks advance.

## Performance tradeoff

Normal cuts forward native QVideoFrames. Transitions use QVideoFrame::toImage and a QPainter CPU compositor, once per Program, then share that resulting frame with all mirror consumers. This intentionally bounded reference path establishes control behavior and visible mix math. It incurs readback/conversion when decoding uses GPU; it is not the final high-throughput GPU compositor. Further engine/GStreamer/graphics-backend evaluation must measure GPU interop, clocks and output synchronization.

## Evidence and limits

Build 0009: 50 functional checks across CPU/automatic modes. Tests include actual trim timestamps, compositor colors, standalone fades, sequential transitions, pause/resume, range loop and failure policies. See evidence/validation.json. Physical monitors, high-resolution throughput, color/HDR/alpha accuracy, audio listening/sample sync, cross-platform builds and endurance remain unqualified.
