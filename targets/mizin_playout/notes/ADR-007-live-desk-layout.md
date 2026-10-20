# ADR-007 — Approved Live Desk interface

Date: 2026-10-20. Status: implement the user's selected A direction.

Keep the existing playback and routing engines. MAIN receives three proportional deck cards, a segmented A/B take destination, large CUT/FADE controls, a configurable duration, explicit Manual/Sequential mode buttons and the shared running-order table. The destination and mode buttons drive the existing per-Program model rather than maintaining a second mode state.

Native monitor containers preserve a 16:9 viewport, with source aspect fitting handled by QVideoWidget. Media titles elide inside their allocated panels. Native vector icons avoid an external font/icon runtime. The sample stage illustration belongs only to layout-preview mode.

The footer dashboard observes independent Program audio peaks, physical route windows and each Program's NDI/OMT publisher. Clicking a tile opens the corresponding settings page; it does not start a publisher or open a display. A route tile describes the source captured when that output opened, rather than falsely adopting a later configuration change. Audio configuration remains on Audio. Preview stays muted.

Running-order media badges identify loaded A/B content with matching file and trim, or the cued Preview row; they do not claim physical signal delivery. Identical duplicate file/trim entries can share a badge. Cue edits still apply on the next launch, and programs retain their existing snapshots.

Minimum desk viewport is 1280×800 logical pixels. In-process widget checks cover the two languages at 1600×1000 and 1280×800, independent destination/mode selection, and settings navigation. Existing playback/transport tests remain relevant because the buttons still operate real channels.

Build through scripts/build.ps1 after the source checkpoint so VERSION and CHANGELOG are generated from scoped structured commits. Preserve build-0020 boards and the old executable before generating the new package and native review boards.
