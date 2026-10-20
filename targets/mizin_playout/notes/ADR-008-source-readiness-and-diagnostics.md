# ADR-008 — Source readiness and observable engine diagnostics

Date: 2026-10-20. First stage of the CasparCG-inspired evolution approved by the user. Original implementation; no CasparCG implementation code is reused.

## READY contract

READY belongs to the selected, cued source and its **applied file/In/Out**, not to an arbitrary loaded Preview path. CueReadiness clears prior proof, loads muted full-range Preview, validates duration and applied trim, and verifies a decoded video timestamp at or after In (within the existing 2 ms tolerance) and before Out. A nonzero In is sought and muted Preview can advance briefly until the qualifying frame arrives, then pauses. Missing, unreadable, corrupt or invalid-range sources cannot enable CUT/FADE. A generation identifies each native load; replaced, cleared and superseded requests cannot reuse old proof.

Keeping Preview full-range preserves EDIT scrubbing outside the applied trim. Editing a draft alone does not change the proof; applying a new range revalidates it. Transition-only changes do not reload the source. File watching and a size/mtime/readability check on TAKE invalidate normal source changes. This is a bounded source check, not decoding the whole file or cryptographic proof that a file never changes.

Audio-only sources use the Qt backend's loaded/buffered state, duration and seek position. They do not claim a decoded-PCM first-sample proof. Video timestamps that are unavailable cannot qualify the In proof. Verification times out after 20 seconds; native load preparation retains its existing 15-second timeout.

READY does **not** claim that the destination Program is already armed, zero-delay switching, frame/sample accuracy or physical delivery. Programs retain their existing independent double-deck preparation on TAKE and sequential preroll. Source-check failure never stops Programs A/B. GPU composition, layered graphics and remote process separation remain later stages.

## Diagnostics contract

Settings contains Playback and Engine diagnostics tabs; the dashboard opens diagnostics without changing transport. Per-Preview/A/B snapshots expose native request/active generations, active and preparation source/state, preparation duration, actual frame dimensions and metadata FPS/codecs, Qt-reported backend buffer progress, video callbacks, valid frame publications in the last second, filtered preroll frames, audio tap count and measured CPU composition last/mean/peak milliseconds. Counts span the channel instance. The recent-publication window is bounded to 512 timestamps and is not a physical-display FPS measurement.

CPU timing encloses image conversion/composition, including the transition output QVideoFrame creation, and runs only when composition occurs. Shared native frames are not converted for diagnostics. Filtered preroll is intentional range filtering, not decoder frame loss. Qt does not expose decoder adapter identity, decode duration, decoder dropped frames or packet-queue depth through this integration; the report stores null and the UI shows Not available. The requested automatic/CPU startup mode is recorded separately.

The four A/B NDI/OMT senders expose their existing actual counters. Superseded video is latest-frame coalescing and remains separate from dropped audio. Output-window counters describe callbacks and geometry, not connector signal delivery. Refresh is 500 ms only while diagnostics is visible. Manual export uses QSaveFile and includes version, UTC, language, readiness, channels, publishers and route state; no remote service is started.

## UI and evidence

Keep the approved Live Desk composition and six main navigation items. Add a compact readiness badge beside muted Preview, a dashboard diagnostics shortcut, and advanced metrics inside Settings. Demo boards explicitly say Sample READY / sample data and are not telemetry evidence. Real UI tests additionally export native READY/diagnostics captures and JSON with live fixture playback.

Compile through the existing commit-driven build/version workflow. Validate source errors, range changes, cancellation, rapid recues, audio-only input, real In timestamps, source modification, active-Program preservation, measured composition and unknown metrics in automatic/CPU modes. Run existing media, transport, outputs, GPU and network regressions because source preparation is shared by the engine.
