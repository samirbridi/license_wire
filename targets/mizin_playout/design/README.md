# Native interface review — Live Desk

The user approved **A — Live Desk** from the [three generated MAIN concepts](proposals/2026-10-20-layout-r1/README.md). The [approval record](APPROVAL.md) defines the direction; actual native rendering is presented separately for review.

MAIN now uses proportional Preview / Program A / Program B cards, a horizontal take strip, segmented A/B destination and Manual/Sequential controls, a shared running-order table and an audio/output dashboard. Coral identifies A, violet B and cyan Preview / FADE. CUT remains amber. EDIT remains separate.

Ten 1600×1000 boards cover MAIN, EDIT, Library, physical outputs, audio and digital outputs, including EN/PT-BR pairs. Two additional compact MAIN boards cover 1280×800. See [REVIEW.md](REVIEW.md) for links and validation scope.

Sample filenames, native stage illustrations, timecodes and sample meters are marked as layout-preview content. They do not demonstrate playback, decoder performance or physical signals. Real media and network-loopback test evidence lives under evidence/.

The implementation uses native Qt widgets and original native vector icons. Generated approval images and screenshots from other products are not embedded as UI assets. Previous native boards are preserved in archive/, including builds 0020 and 0022.

Capture command: scripts/capture-boards.ps1. Optional -Directory, -Width and -Height select an alternative destination and viewport; the default remains design/boards/ at 1600×1000. Native CLI --capture-size 1280x800 can export an individual compact board.
