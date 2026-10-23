# Your first show

For the Windows private preview, run the Setup EXE to install for your account, or extract the ZIP and run MizinPlayout.exe. The Microsoft Visual C++ runtime files are included beside the app (no administrator permission needed); the official machine-wide installer stays in prerequisites/. If Setup is blocked on a computer, the portable ZIP is the same application. The official NDI and OMT runtimes are included privately beside the app. Normal startup keeps settings under %LOCALAPPDATA%/Mizin/Mizin Playout. Start portable.cmd (or --portable) uses adjacent state/; --state-dir overrides either mode. Reinstallation/uninstallation preserves user settings and media. Existing development launcher paths remain valid. Save shows explicitly; media files stay in their original folders.

The Live Desk starts with muted Preview and one **PROGRAM**. **+ Add Program** creates an independent Program with an empty running order. Select the Program in MAIN to edit its playlist and operate CUT/FADE, Manual/Sequential, Loop and Repeat. With additional Programs, MAIN builds a multiview of all Programs beside muted Preview. Click a Program name in the grid or use the destination menu to select its playlist and TAKE controls. Selection does not interrupt playback. Each tile has play/pause and Black controls for that tile's Program. Larger configurations scroll inside the multiview.

Wait for the green **READY** badge beside muted Preview before a manual take. It verifies the selected file, applied trim and a decoded video frame in range. A new applied range is checked again. **Preparing**, **Not cued** and **Error** do not enable CUT/FADE. Correct an error and cue the source again. Files changed after preparation lose READY; a final file check also runs on TAKE. The Program still prepares its own deck when you take the source; READY is not a promise of zero-delay switching. Audio-only files use the backend's preparation/seek state.

Open **Settings → Engine diagnostics**, or use the small gear in MAIN's bottom dashboard. Refresh reads channel states, frame publications, buffer progress, CPU composition times and per-Program NDI/OMT counters. **Export report** saves a local JSON report. **Not available** means the backend does not expose the measurement; it does not mean zero usage or zero dropped frames. Video publications are callbacks, not proof of physical monitor FPS.

1. In **MAIN**, add files, add a folder or drop local media on the window.
2. Double-click a running-order item, or choose Cue selected, to load muted Preview. CUT and FADE become available when that selected item is prepared.
3. Choose **Edit cue** or open **EDIT** to prepare In/Out and per-item transitions. Select a cue, scrub Preview and Mark In / Mark Out, or enter seconds with milliseconds. Out = End of media uses the remaining file. Apply cue saves these non-destructive settings. Reset edits reloads the applied values.
4. Return to MAIN, select the destination Program and press **CUT** for an immediate switch after preparation, or **FADE** for a dissolve. Fade duration defaults to **300 ms**, can be adjusted from 1 to 10000 ms and is remembered on this computer. CUT / Ctrl+Enter ignores the cue's entry fade. FADE / Ctrl+Space also fades from black when the destination is empty. These manual actions preserve saved cue settings. The shortcuts operate only in MAIN.
5. Select **Manual** for manual switches; playback holds at Out. With Fade out it ends on black. Select **Sequential** to advance using each next item's saved transition; Repeat order repeats the list, including a single item. Each Program has its own mode. **Loop** repeats only the current trimmed range in manual mode.
6. Open Outputs to assign Programs to displays. The same Program mirrors the same frames; audio plays once per Program. Escape closes an output window. The MAIN dashboard shows main/selected audio meters and aggregate configured/open/sending counts; detailed per-Program/route state is in Outputs/Audio/Engine diagnostics. Clicking a route or protocol tile opens its settings; it does not activate that output. Use the audio icon to open Audio routing.
7. Save show writes a schema-4 .mizinshow with every applied Program playlist, stable identities and route sources. Schema-1/2/3 shows still open; legacy shared lists migrate to independent copies. Duplicate cue reuses a file with separate trim settings.

## Programs, copies and mirrors

Every launch starts with one Program and one display route. **+ Add Program** creates another independent channel and an empty playlist. Add/drop files or folders to that selected Program; the shared Library can reference the same original file in several lists. Apply/reset editor drafts before changing Program. Preview readiness is cleared on a Program change; cue the selected list before a manual take. Running Programs are not stopped.

**Copy A playlist** fills an empty selected list with copies of A's applied cues. Changes and playback are independent afterwards. Existing items are preserved; use a new/empty Program for a fresh copy. For live mirroring, use **Outputs → Displays → + Add display output** and choose A as the source. Mirrors follow A's current playback and do not allocate another decoder. Choose another Program for independent content.

**Outputs → Displays** lists every Program, including those with no display route. The table shows playlist item counts and configured route numbers. **+ Add route** on a Program creates a closed route with that Program selected as its source; choose a screen/profile and open it manually. Creating a Program creates an independent playback channel, not another screen. The global **+ Add display output** defaults to A for mirroring. Changes to a route source take effect when reopening it.

Add/remove routes as needed. Close the last display before removing it. Black an extra Program and close/stop its displays and NDI/OMT senders before removing that Program; loaded/paused media or an ongoing import also blocks removal. A cannot be removed. Select the Program in MAIN or the Outputs inventory before using **Remove selected Program** in Outputs. Surviving identities/audio preferences are retained; closed routes pointing to a removed Program return to A.

Save show stores all applied playlists, stable Program IDs and route sources (schema 4). Legacy schema 1/2 open as one Program; schema 3's shared running order becomes an independent copy for each legacy Program. Loading never starts displays/senders. Three Programs and five floating display routes are the functional proof, not a hardware capacity rating. Defensive allocation guards are 64 Programs / 128 routes; actual usable concurrency depends on the machine/media and must be measured for the event.

## Live operation

Each manual CUT or FADE starts a snapshot of the current running order for that Program. Editor changes apply on the next launch, after Apply cue. Unapplied fields are not sent to Program by CUT/FADE or saved in the show; apply before changing the selected item. Switching MAIN/EDIT or preparing muted Preview does not stop the Programs. Sequential mode preloads one next item; an unready item waits at the boundary. A failed next item reports an error and stops advance. Short ranges clamp fades to half the range. A prepared next cue replaces the current cue's standalone exit fade in sequential mode.

## Detached decks and ON AIR

The detach icon at the corner of each deck (Preview, Program and every multiview Program) opens that deck in its own window, which can be moved to another monitor and resized. **F11** or the fullscreen button toggles fullscreen; **Esc** leaves fullscreen. Closing the window (or clicking "In separate window · click to dock" on the deck) docks it again. The window uses the Program's existing frames without reopening media, and its buttons act only on that Program. It is an operator monitor, not an output: use Outputs for screens/LED. Its position is remembered; if that monitor carries an open output, the window opens on the desk monitor instead.

A Program with media on air (playing or paused) gets the red bar and the **ON AIR** badge; Black/empty does not. The blue border still marks the TAKE destination.

## Web monitor (watch in a browser)

In **Outputs → Web monitor**, choose **Local network (LAN)** or **This computer only**, the port (default 8787) and click **Start web monitor**. The addresses with the access code appear (e.g. `http://192.168.1.30:8787/?k=code`): open one on a phone, tablet or another computer on the same network. The page lists the Programs with the **ON AIR** badge; **Watch** opens a Program live (1280×720, up to 30 fps, stereo audio). Audio starts muted by browser rule: tap **Sound**. It is view only — nothing in the browser controls playout.

The web monitor never starts by itself at launch. **New code** replaces the code and disconnects everyone. Each watched Program uses a single Windows H.264 encoder shared by all its viewers. Windows may ask to allow network access the first time; video uses UDP ports 50200–50399. Do not expose the port to the internet.

**Quality**: **Automatic** follows each Program's source (1080p stays 1080p, 4K is reduced to 1080p, smaller sources keep their size); **720p**, **1080p** and **4K** are fixed. Changes apply live. The graphics card's encoder (NVIDIA, Intel, AMD) is used when available; 4K needs it and a wired network (about 25 Mbit/s per watched Program).

## Low-latency audio output

In **Audio → Low-latency output**, choose the engine and device and click **Start low-latency output**. **WASAPI exclusive** talks directly to the driver (lowest delay; the device is reserved for Mizin). **WASAPI shared low-latency** lets other apps keep using the device. **ASIO** (Dante Virtual Soundcard, Behringer UMC, Blackmagic) is only available in the Steinberg-licensed build. In **Buffer**, "Device minimum" is the lowest delay; raise it if you hear clicks.

Pick each Program's output pair (e.g. A on 1–2, B on 3–4) — useful on multi-output interfaces such as Dante. Each Program's volume, mute and Local monitoring still apply. **Sync with the video automatically** measures how late video frames are published and delays the audio only as needed; use **Fine adjust** (ms) for projector/LED processor delay. If the device fails or is unplugged, every Program falls back to its normal output automatically. NDI, OMT and the web monitor are not affected.

### AES67 network audio (Dante-compatible)

In **Audio → Low-latency output** choose the engine **AES67 network (Dante-compatible)** and the network adapter. Set the **stream name**, how many **channels** (up to 64; every 8 channels form one multicast stream), the **multicast address** (automatic 239.69.x.y) and the **receiver latency** (use the same on the receivers). Each Program goes to its channel pair, as on an interface.

The stream is announced on the network (SAP), so it appears in **Dante Controller** as an AES67 flow and in other AES67 receivers. On Dante devices, enable **AES67 mode** in Dante Controller. The clock is PTPv2: the playout follows the network grandmaster (a Dante device in AES67 mode takes that role) and becomes the grandmaster itself when there is none. The status line shows the PTP state. Use a wired network; on managed switches allow multicast/IGMP and prioritise PTP and audio traffic.

Native Dante (no virtual soundcard, the playout appearing as a Dante device) waits for Audinate's licence.

## Autosave, recovery and missing media

While there are unsaved changes, Mizin Playout writes an automatic copy of the show every few seconds to its settings folder. If the app closes without saving (crash, power cut), the next start asks whether to restore that copy; the show comes back marked as unsaved so you can save it. A discarded copy is kept in `recovery/` (latest 5), never deleted silently. When you save over a show, the previous version stays next to it as `.mizinshow.bak`.

If a show is opened on another computer or with the drive on another letter, the app tells you how many media files were not found and asks for the folder where they are. It searches by file name, including subfolders; when several files share a name, it picks the one in the most similar folder and leaves ambiguous cases out. You can also do it from **Library → Locate missing media**. Programs on air are not changed; the fix applies to the next takes and marks the show to be saved.

## Portable show package

**Export show package** (top bar, next to Save show) creates a folder with the show file and a `media/` subfolder holding every media file used by all Programs. Paths are relative to the show folder: copy the whole folder to another computer, drive or USB stick and open the `.mizinshow` from there. Files with the same name from different folders get "(2)", "(3)"… The app checks free space first, shows progress with Cancel and verifies each copy's size; missing media is left out and listed at the end. Saving a show whose media lives inside its folder keeps those paths relative.

## Mizin Link: several machines on the network

In **Outputs → Mizin Link**, choose each computer's role: **Master** (sends the show) or **Follower** (receives). Use the same **Link code** on every machine (New code generates one) and click **Start Link**. Followers find the master on the network by themselves (or type its address). The table shows each machine, the measured clock offset and how many media files it already has.

On the master, **Send show to machines** sends the current show and all its media; every file is verified with SHA-256 and, when sending again, only what changed or is missing is downloaded. On a follower, **Load received show** opens the show with the copied media. Messages without the right code are refused. This is phase 1; backup mirroring (the backup repeats the main and can take over) and synchronized playback across PCs come in the next versions.

### Main + backup (mirroring)

On the backup machine (Follower), after **Load received show**, tick **Mirror the master (backup)**. From then on it repeats every CUT and FADE, pause, black and loop of the main machine and follows each Program's position, correcting when the drift exceeds 80 ms. The status line shows the position error and how many corrections were made. Open the backup's outputs as usual; they never open by themselves.

If the main machine fails or stops answering for 1.5 s, the red **MASTER LOST** bar appears: the backup keeps playing on its own, you switch the screens to it (on your switcher/matrix) and, if you want, click **Take over as master** so it commands the other machines.

### Several PCs playing together (split LED wall)

On the master, tick **Synchronized takes**. From then on every CUT and FADE is prepared on all machines and fired at the same instant (the take waits 0.4 s). On the followers tick **Mirror the master** as on a backup: they hold position by nudging playback speed (up to 5%), without jumps, and only seek when the drift exceeds 250 ms. The master's machine table shows each follower's drift.

To split a wall across outputs or PCs, in **Outputs → Displays** choose each output's **AREA**: halves, thirds, quarters or **Custom area** (X, Y, width and height in % of the video). Each screen shows only its part, stretched to fill the screen.

### Remote control (control station)

On the master, in **Remote operators**, click **Add operator**: set the name, the PIN, the permission (**Operator** controls, **Viewer** only watches) and which Programs it may command (**All Programs** or some). On the other machine choose the role **Control station (remote)**, use the same Link code, type the operator name and PIN and click **Start Link**. The **Remote desk** shows every Program, what is on air and the playlist: select an item and use CUT, FADE, BLACK or PAUSE.

The playout machine stays in charge: it checks every command, runs it as if it were local (synchronized takes included) and logs everything in `link/remote-log.txt`. The PIN never travels over the network; changing the PIN or removing the operator signs the station out at once.

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

1. Open **Outputs → NDI / OMT** and find the main Program, or B after enabling it.
2. Enter a **Source name** to identify this output at the receiver.
3. Enable **Include audio** for stereo 48 kHz Program audio with SDR video; disable it for video only. This switch applies to both network protocols for that Program.
4. Click **Start NDI** or **Start OMT**. Both protocols can run together alongside display outputs. The panel shows the published source and connection/video/audio counters.
5. Select that source in a compatible receiver. Stop ends only that protocol; Program playback continues.

Video follows source size/cadence. Black preserves the last stream size/cadence. An initially empty Program publishes 1280×720/30 black. Saved preferences/design previews never auto-start transmission. Closing the application stops its senders.

The official NDI runtime is bundled beside the app; a separate runtime installation is not required. Vendor/third-party notices are in licenses/ndi. OMT uses the native libraries included in this development package. The initial network path is 8-bit SDR/stereo, without HX, HDR, exclusive ASIO, multichannel mapping or a manual delay offset. Qualify a separate receiving computer and AV sync with actual media/network conditions before an event. See [scope and evidence](compatibility-and-performance.md).

[About NDI®](https://ndi.video/) · NDI® is a registered trademark of Vizrt NDI AB.




## Minimal controls and resource footer

In MAIN, **Add media** opens file/folder import options. The **+** icon beside the destination adds an independent Program. Reorder arrows move a selected cue; **More** contains Duplicate cue and Remove cue. Cue, Edit and Copy A remain directly accessible. Manual/Sequential share stable text sizing in both states.

The persistent footer shows this process's normalized CPU load, RAM working set (MB/GB) and busiest observed Windows GPU engine when available. FPS counts video publications from the selected Program in the last second; it does not measure the physical display. Composition is the last CPU transition composition time, not total rendering latency. Hover for scope/version. Missing/stale counters use a dash. Sampling runs in the background about once per second. Engine diagnostics JSON includes the underlying process_usage values; this does not identify which GPU decodes a video.


RAM and GPU memory use decimal MB/GB and automatically switch to GB at 1000 MB. GPU shows activity % and current application graphics-memory usage separately. Memory comes from DXGI usage across queried hardware adapters (LOCAL + NON_LOCAL, node 0); it is not installed VRAM capacity. Missing/partial readings show a dash. **Composition**, formerly Mix, measures the CPU work to blend one transition frame; a 300 ms fade duration is a separate setting. The tooltip and diagnostic JSON provide memory scope and per-adapter readings.

## Optional updates

Normal packaged startup checks for updates after eight seconds. Choose **View update** to read the English or Portuguese changes, **Download update** to fetch it, then **Install and restart** when ready. **Later** dismisses the banner. Settings → Updates also has **Check now**. Nothing downloads or installs without your choice. Downloads are signed-metadata/hash verified. Stop Programs and close display/NDI/OMT outputs, apply/reset edits and save your show before installation. The updater preserves your profile and reopens your saved show with outputs closed. Portable folders are updated in place without creating an installed-app registration. Build 0035 needs one manual installation to receive the updater.

NDI diagnostics verify source-frame sequence, content hashes and strictly increasing SDK delivery timestamps. An exact cached frame may be replayed when connecting; it is recorded separately. See ISSUE-001 for the diagnosis and raw evidence. Physical AV-sync and another LAN receiver remain separate qualifications.
