# Reference study: native playout and continuity

Collected on 2026-10-19. This is a comparison of public documentation, not a local performance test. Each reference has its own isolated evidence folder and URL/hash manifest.

| Reference | Useful documented concepts | Our implementation decision |
| --- | --- | --- |
| [ffplayout](https://github.com/ffplayout/ffplayout) | Folder mode, editable daily JSON playlists, source/In/Out, looping, filler policies and CPU operation. | Store trim points as metadata. Keep event running orders separate from a future wall-clock scheduler. A web control panel does not imply that browser codecs must decode the local media. |
| [CasparCG](https://casparcg.com/), [AMCP](https://github.com/CasparCG/help/wiki/AMCP-Protocol) | Background preparation, TAKE, channels/consumers, SEEK/LENGTH and optional automatic transitions. | Prepare the next item before a transition. Keep A/B transport state independent. Mirror one channel result rather than reopening a file for every output. |

Both repositories publish GPL license texts. No source implementation was copied or linked into the application. Downloaded documentation is retained as research evidence, not bundled in the executable. Our native application continues to use its own Qt/FFmpeg implementation and its separately documented dependency obligations.

## Scope of this milestone

- Per-cue In/Out (milliseconds), input validation and schema-1 migration to schema 2.
- Manual playback holds the final included video frame; optional exit fade finishes on black.
- Sequential playback preloads the next cue; Cut, Dissolve and Fade through black use the incoming cue's transition setting. A prepared next cue supersedes the outgoing cue's standalone exit fade.
- Independent entry/exit fades work without another clip. Short segments clamp fades to half the range.
- Each Program takes a snapshot of the order at TAKE. Later edits apply at the next TAKE. A/B can run different snapshots and playback modes.
- If preparation is late, hold at the boundary; if preparation fails, report the error and stop advancing. This prototype does not promise a frame-accurate broadcast clock or gap-free playback for arbitrary media.

## Performance boundary

Automatic native decoding may select hardware; CPU decoding can be forced. Normal cuts forward shared native frames. Transitions currently convert to an image and blend in CPU once per Program; mirror outputs share that result. This is an explicit reference compositor, not a GPU compositor or zero-copy transition path. NVIDIA/AMD qualification, HDR/alpha/color management, high-resolution performance and production AV synchronization remain open.

Reference evidence: `../../ffplayout/evidence/sources.json` and `../../casparcg_server/evidence/sources.json`.
