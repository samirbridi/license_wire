# Your first show

Status: development prototype. English is the default; Português (Brasil) is available in the top bar.

1. Open MizinPlayout.exe or Start Mizin Playout.cmd after building.
2. Choose **Add files** or **Add folder**, or drop local files/folders on the window. Folder discovery runs in the background. Original files stay in place.
3. Double-click a running-order item to prepare it in **Preview**, with muted audio.
4. Select **Program A** or **Program B** in Take destination.
5. Choose **TAKE** or press **Ctrl+Enter**. The incoming deck must produce a frame before replacing the current Program. This prototype uses cuts.
6. In **Outputs**, select the source Program and a display. **Floating test window** is useful before using a projector. Choose **Open output**.
7. Select the same Program for multiple outputs to mirror video, or different Programs for independent content. Audio is emitted once per Program, not once per mirror.
8. Press **Escape** in an output window to close it. **Black selected channel** clears one Program.
9. Choose **Save show** to create a .mizinshow file. **Open show** restores its media references and running order. Moving media may require rebuilding references in this prototype.

The top-bar language switch preserves playback and media names. Preferences stores automatic hardware selection or CPU decoding; restart to apply. F1 opens native help.

MP4/MKV/AVI/MOV are containers. Playback depends on their actual codecs and the pinned FFmpeg backend. The program does not require conversion to a browser format. Unsupported or damaged media reports an error; current Program is preserved if incoming preparation fails.

## Development limits

Two logical Programs and three output-route rows are implemented in this first slice. Dissolve/compositing, trim controls, per-device audio routing, autosave/relink, scheduling, remote control and production qualification remain milestones. Multiple output windows are not evidence of synchronized physical connectors or genlock. Test the show on its actual machine and displays before operational use.
