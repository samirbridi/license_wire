# ADR-011 — All-Program multiview and explicit routing inventory

Decision: retain the single-Program startup layout. With additional Programs, replace the single selected extra monitor with a responsive grid of every Program, beside muted Preview. A cyan outline identifies the selected edit/TAKE destination. Selection preserves ongoing playback; Apply/Reset still guards editor drafts.

Each tile subscribes to its existing NativeChannel frame publications and initializes from its retained frame. Tiles allocate no decoders, do not reload media, and operate their own stable Program ID. Visible video sinks receive frame updates; hidden views avoid repeated presentation. Grid columns adapt to width (up to three), with bounded tile height and scrolling for larger inventories. The allocation guards remain unrelated to measured live concurrency.

Topology changes rebuild views; removal clears view consumers before destroying a runtime. Selection and language changes reuse the existing topology. Program playlist/model, display routes, audio and network ownership remain unchanged.

Outputs lists all Programs, playlist lengths and configured route numbers, including Programs without screens. Per-Program Add route allocates a closed route assigned to that Program; the global Add display output defaults to A. A Program is an independent playback source, not a physical screen. The summary uses separate Program/route counts and proper singular/plural strings. Changes to an open route remain staged until reopen, as before.

Controls: fixed compact Fade duration group aligns to CUT/FADE; Manual/Sequential have an explicit 8px gap; output open/close controls align with the bottom of route fields; the Displays tab has an 18px inset. The network tab is labelled NDI / OMT in both languages.

Validation: five Programs with one route, all tiles visible at 1600x1000 and 1280x800 in EN/PT-BR; tile selection/transport; per-Program route creation without automatic opening; independent live channels; stable identity/removal/show restoration. Actual result files are linked in the stage evidence after execution. Physical display, maximum capacity and NDI timestamp qualification remain separate.
