# Your first show

The approved Live Desk layout starts with muted Preview and one **PROGRAM**. Use **+ Add Program** in MAIN when the event needs independent content; A/B destination buttons and B controls then appear. EDIT stays separate.

Wait for the green **READY** badge beside muted Preview before a manual take. It verifies the selected file, applied trim and a decoded video frame in range. A new applied range is checked again. **Preparing**, **Not cued** and **Error** do not enable CUT/FADE. Correct an error and cue the source again. Files changed after preparation lose READY; a final file check also runs on TAKE. The Program still prepares its own deck when you take the source; READY is not a promise of zero-delay switching. Audio-only files use the backend's preparation/seek state.

Open **Settings → Engine diagnostics**, or use the small gear in MAIN's bottom dashboard. Refresh reads channel states, frame publications, buffer progress, CPU composition times and A/B NDI/OMT counters. **Export report** saves a local JSON report. **Not available** means the backend does not expose the measurement; it does not mean zero usage or zero dropped frames. Video publications are callbacks, not proof of physical monitor FPS.

1. In **MAIN**, add files, add a folder or drop local media on the window.
2. Double-click a running-order item, or choose Cue selected, to load muted Preview. CUT and FADE become available when that selected item is prepared.
3. Choose **Edit cue** or open **EDIT** to prepare In/Out and per-item transitions. Select a cue, scrub Preview and Mark In / Mark Out, or enter seconds with milliseconds. Out = End of media uses the remaining file. Apply cue saves these non-destructive settings. Reset edits reloads the applied values.
4. Return to MAIN, choose the destination (when B is enabled) and press **CUT** for an immediate switch after preparation, or **FADE** for a dissolve. Fade duration defaults to **300 ms**, can be adjusted from 1 to 10000 ms and is remembered on this computer. CUT / Ctrl+Enter ignores the cue's entry fade. FADE / Ctrl+Space also fades from black when the destination is empty. These manual actions preserve saved cue settings. The shortcuts operate only in MAIN.
5. Select **Manual** for manual switches; playback holds at Out. With Fade out it ends on black. Select **Sequential** to advance using each next item's saved transition; Repeat order repeats the list, including a single item. Each Program has its own mode. **Loop** repeats only the current trimmed range in manual mode.
6. Open Outputs to assign Programs to displays. The same Program mirrors the same frames; audio plays once per Program. Escape closes an output window. The MAIN dashboard shows only configured Programs, display routes and NDI/OMT states. Clicking a route or protocol tile opens its settings; it does not activate that output. Use the audio icon to open Audio routing.
7. Save show writes a schema-3 .mizinshow with applied cue settings and output configuration. Schema-1/2 shows still open with one Program and one display route. Duplicate cue reuses a file with separate trim settings.

## Outputs for each event

Every launch starts with **one Program and one display route**, with no display window or digital sender automatically started. **Outputs → Displays → + Add display output** adds a mirror of the main Program. Select B in a route for different content after using **+ Add Program** in MAIN or **+ Add independent Program** in Outputs. Current capacity is two independent Programs and three display routes.

Use **Close output** (or Escape) before removing the last display route. To remove B, Black it and close its display outputs / stop its NDI and OMT senders first; loaded or paused media also blocks removal. A keeps playing. The last Program and first display route cannot be removed.

Save the show to retain Program count, display count and source mapping for this event. Reopening restores these choices without opening displays or starting senders. Physical display endpoints and local audio/scaling preferences are separate.

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

## Program audio

Open **Audio** to configure the active Program(s) separately. **Master volume** and **Mute** affect both local and network audio. **Local monitoring** enables/disables only this machine's playback. Choose an **Audio device** for a detected HDMI, audio interface, USB or virtual endpoint. System default follows the OS default. An unavailable selected endpoint mutes local output until restored/replaced; it does not redirect sound silently to another device.

L/R meters show Program mix peaks in dBFS. Preview stays muted and mirrored display outputs do not duplicate local sound. Audio preferences belong to this computer, separately from the show file.

## Digital NDI and OMT outputs

1. Open **Outputs → Digital / IP** and find the main Program, or B after enabling it.
2. Enter a **Source name** to identify this output at the receiver.
3. Enable **Include audio** for stereo 48 kHz Program audio with SDR video; disable it for video only. This switch applies to both network protocols for that Program.
4. Click **Start NDI** or **Start OMT**. Both protocols can run together alongside display outputs. The panel shows the published source and connection/video/audio counters.
5. Select that source in a compatible receiver. Stop ends only that protocol; Program playback continues.

Video follows source size/cadence. Black preserves the last stream size/cadence. An initially empty Program publishes 1280×720/30 black. Saved preferences/design previews never auto-start transmission. Closing the application stops its senders.

NDI requires an official installed runtime; missing dependencies are reported. Restart the application after installing a missing runtime. OMT uses the native libraries included in this development package. The initial network path is 8-bit SDR/stereo, without HX, HDR, exclusive ASIO, multichannel mapping or a manual delay offset. Qualify a separate receiving computer and AV sync with actual media/network conditions before an event. See [scope and evidence](compatibility-and-performance.md).

[About NDI®](https://ndi.video/) · NDI® is a registered trademark of Vizrt NDI AB.


Known issue: local regression intermittently fails strict NDI receiver video timestamp monotonicity, even while video/audio arrive. This remains unresolved; see [ISSUE-001](../notes/ISSUE-001-ndi-receiver-timestamps.md). NDI frame-order/AV-sync qualification is pending.
