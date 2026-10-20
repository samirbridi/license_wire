# Your first show

1. In **MAIN**, add files, add a folder or drop local media on the window.
2. Double-click a running-order item, or choose Cue selected, to load muted Preview. CUT and FADE become available when that selected item is prepared.
3. Choose **Edit cue** or open **EDIT** to prepare In/Out and per-item transitions. Select a cue, scrub Preview and Mark In / Mark Out, or enter seconds with milliseconds. Out = End of media uses the remaining file. Apply cue saves these non-destructive settings. Reset edits reloads the applied values.
4. Return to MAIN, choose Program A or B and press **CUT** for an immediate switch after preparation, or **FADE** for a dissolve. Fade duration defaults to **300 ms**, can be adjusted from 1 to 10000 ms and is remembered on this computer. CUT / Ctrl+Enter ignores the cue's entry fade. FADE / Ctrl+Space also fades from black when the destination is empty. These manual actions preserve saved cue settings. The shortcuts operate only in MAIN.
5. Leave Sequential off for manual switches; playback holds at Out. With Fade out it ends on black. Enable Sequential to advance using each next item's saved transition; Repeat order repeats the list, including a single item. Each Program has its own mode. Loop selected channel repeats only the current trimmed range in manual mode.
6. Open Outputs to assign Programs to displays. The same Program mirrors the same frames; audio plays once per Program. Escape closes an output window.
7. Save show writes a schema-2 .mizinshow with applied cue settings. Schema-1 shows still open. Duplicate cue reuses a file with separate trim settings.

## Live operation

Each manual CUT or FADE starts a snapshot of the current running order for that Program. Editor changes apply on the next launch, after Apply cue. Unapplied fields are not sent to Program by CUT/FADE or saved in the show; apply before changing the selected item. Switching MAIN/EDIT or preparing muted Preview does not stop the Programs. Sequential mode preloads one next item; an unready item waits at the boundary. A failed next item reports an error and stops advance. Short ranges clamp fades to half the range. A prepared next cue replaces the current cue's standalone exit fade in sequential mode.

## Language and performance

English is default; Português (Brasil) can be selected during playback. Automatic hardware decoding and CPU decoding are available in Settings after restart. Codec/profile/driver support varies. Cuts forward shared native frames; transitions currently convert and compose in CPU once per Program. GPU composition, remote control, scheduling and production AV-sync/performance qualification remain future work. Layout samples demonstrate the interface, not physical-output playback.

## Output resolution and scaling

Displays open fullscreen at their current system mode; this application does not switch the desktop resolution. Video is fitted without distortion or cropping, with black bars for differing aspect ratios. A 4K source on a 1080p display is reduced; 1080p on 4K is enlarged. Scaling never restores missing source detail.

Each route offers three profiles:

- **Native · performance** — default and recommended for live operation. Native frames go straight to the Qt output surface.
- **Lanczos · GPU (SDR)** — optional Lanczos-3 scaling using a desktop OpenGL GPU. This first path shares input readback per Program, then filters/presents textures on the GPU. Test it with the actual media and output count before a show.
- **Lanczos · experimental (CPU)** — CPU reference scaler. Current 4K measurements exceed the 30 fps frame budget.

Select the source, display and profile in Outputs, then Open output. Reopen the route to apply changes. Escape closes only that output; Programs continue. Displays added/removed refresh automatically.

The GPU path is currently for 8-bit SDR, with bounded sizes/reduction ratios. High-depth/HDR/transformed/subtitle frames use Native; GPU context/resource failures also return to Native and report a warning. A machine without supported hardware decoding can still decode on CPU. CPU decoding and GPU output scaling are separate settings. No pre-conversion is required for supported media, and original files are never rewritten.

Lanczos is spatial resampling, not AI reconstruction. It cannot recover missing detail. The current GPU path still reads hardware frames back before upload; it is not zero-copy. See [current measured scope](compatibility-and-performance.md) for the tested GPU, actual framebuffers and remaining performance/AV-sync limits.
