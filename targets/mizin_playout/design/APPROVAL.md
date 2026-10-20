# Live Desk direction — approved 2026-10-20

The user selected **proposal A — Live Desk** after comparing the three static MAIN concepts: “Gostei muito do modelo A”. They then requested continuation.

After the native build-0023 implementation was presented, the user endorsed it with “Ficou muito bom!”. The accepted native baseline is preserved in archive/build-0023/. Subsequent READY/diagnostics additions retain this direction and are documented in REVIEW.md.

Approved direction: dark native workspace, sidebar navigation, prominent Preview / Program A, persistent Program B, explicit A/B take destination, horizontal CUT / FADE strip (300 ms default), a shared running-order table and a compact audio/output dashboard.

The implementation uses native Qt widgets, original vector icons and native sample graphics. Generated concept screenshots remain review references and are not embedded as application textures. English remains default with runtime PT-BR switching. Existing EDIT, Library, Outputs, Audio and Settings functions remain available.

The direction approval does not certify final native rendering or physical audio/video output. Export and review actual native boards after compilation; report technical checks separately from the user's final visual assessment.

Reference: [approved A concept](proposals/2026-10-20-layout-r1/A-live-desk.png). B and C are retained as alternatives, not selected directions.


On 2026-10-20 the user requested one output by default, enabling more for events that need them. This supersedes the persistent-B aspect above: the native revision keeps the approved A layout with a single PROGRAM by default and exposes B only after + Add Program. See ADR-009 and REVIEW.md for implementation evidence; the new captures remain available for visual assessment.


On 2026-10-20 the user explicitly requested dynamic Programs/outputs and independent playlists or copies of A. The implementation retains the Live Desk direction with a Program selector, main A plus the selected extra monitor, independent running orders and aggregate route/network tiles. In the same session the user approved logo proposal A (cyan M/play monogram); proposal B/C and all original boards/prompts remain in design/branding/proposals/2026-10-20-r1/. The SVG/native redraw follows this direction; it is separate from maximum-concurrency or physical-output approval.


The user subsequently requested alignment/spacing fixes, an all-Program multiview, a complete Program list in Outputs and the label NDI / OMT. ADR-011 implements that request within the accepted Live Desk direction. New native captures are implementation evidence for review; this entry does not claim final human approval of the revised rendering.


The user then reported remaining TAKE alignment and selected-Sequential clipping, requested a vMix-like performance footer and a more minimal organization. ADR-012 addresses those concrete corrections within Live Desk A. Previous build-0030 boards/package are preserved; new selected-mode captures are implementation evidence pending the user's visual assessment.


The user subsequently requested decimal MB/GB, GPU activity plus application-memory usage, and clarification of Mix. ADR-013 changes footer metrics/labels within the accepted minimal Live Desk layout. It does not imply new human approval or physical output qualification. Prior build-0032 assets/package are preserved.
