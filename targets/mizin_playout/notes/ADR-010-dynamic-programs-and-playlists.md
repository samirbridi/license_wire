# ADR-010 — Dynamic Programs, independent playlists and mirrored routes

The user requested more than A/B and three displays, per-Program playlists, main-Program mirrors and copies of A's playlist. This stage precedes GPU transition composition so that the compositor can later be owned once per dynamic Program.

## Model and operation

- One permanent main Program (stable ID 1), one display route and no automatic sender/window activation remain the startup default.
- Additional Programs allocate their own NativeChannel, two native decks, PlaylistController and NetworkBus only when added or restored from a show. Extra display routes reuse an enabled Program and do not allocate a decoder.
- MAIN selects a Program and shows its applied running order, transport and optional extra monitor beside Preview/main A. The dashboard aggregates route/network counts; Audio and Digital/IP panels, diagnostics channels and routes grow dynamically.
- A new Program starts with an empty list. `Copy A playlist` clones applied cue metadata into an empty selected list; subsequent edits are independent. Existing items are never overwritten. This differs from a route sourced from A, which follows A's actual live output.
- Switching Program stores the applied list, clears muted Preview readiness and selects the other list without reloading/Black commands to running Programs. Unapplied editor drafts block switching until Apply/Reset. Background folder imports retain their target Program ID; opening a different show waits for a pending scan.
- Removal requires an idle extra Program: no loaded/paused media, preparation, live display, NDI/OMT sender or active scan. The primary cannot be removed. Closed routes referencing a removed Program return to A; surviving Program IDs, native objects, settings and source mappings remain stable.
- Source/scaling changes remain staged until an output is opened. A show restores configuration without starting displays, senders or playback. Existing live channels retain their running-order snapshot when compatible model data is loaded; a topology replacement is rejected before deleting busy resources.

## Persistence and allocation bounds

Schema 4 saves Program IDs/names and independent playlists plus route source indexes. Schema 1/2 load into one Program; schema 3's shared list becomes independent copies for each legacy Program. Invalid IDs/counts/cues/routes reject atomically.

Input/allocation guards are 64 Program definitions and 128 display routes. These replace the prior 2/3 proof limits and prevent unbounded allocations from a show file. They are **not tested simultaneous playback capacities**. CPU/GPU, codecs, resolutions, memory, network and physical display hardware determine practical capacity. This stage validates three Programs and five floating routes, not 64/128 live feeds.

## Identity

The user approved logo proposal A on 2026-10-20. All three original image_gen raster boards and prompts are preserved in design/branding/proposals/2026-10-20-r1/. The selected M/play symbol is redrawn as original SVG and QPainter paths; the raster approval board is not embedded in UI. The native rail/window icon uses this vector construction. Installer/executable-resource icon packaging remains separate.

## Deferred / known limits

Transitions still use CPU composition; GPU Lanczos only handles optional output scaling. GPU transition composition with CPU fallback follows this structural change. Remote control and other platforms remain future milestones. ISSUE-001 (intermittent NDI receiver timestamp ordering) remains open; no network implementation change or resolution is claimed here. Physical outputs/AV sync and maximum concurrency remain unqualified.
