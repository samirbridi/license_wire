# Your first show

1. Add files, add a folder or drop local media on the window.
2. Double-click a running-order item to load muted Preview. Scrub the slider, then Mark In / Mark Out, or enter seconds with milliseconds. Out = End of media uses the full remaining file.
3. Select Cut, Dissolve or Fade through black and its duration. Fade in / Fade out also work for a single clip. Apply cue saves these non-destructive settings.
4. Choose Program A or B, then TAKE / Ctrl+Enter. The incoming file must produce its frame at In before replacing Program.
5. Leave Sequential off for manual Takes; playback holds at Out. With Fade out, it ends on black. Enable Sequential to advance automatically; Repeat order repeats the running order, including a single item. Each Program has its own mode. Loop selected channel repeats only its current trimmed range, in manual mode.
6. Open Outputs to assign Programs to displays. The same Program mirrors the same frames and audio plays once per Program. Escape closes an output window.
7. Save show writes a schema-2 .mizinshow with all cue settings. Older schema-1 shows can still be opened. Duplicate cue reuses the same file with independent trim settings.

## Live operation

Each TAKE starts a snapshot of the current running order for that Program. Further edits apply on the next TAKE. Sequential mode preloads one next item; an unready next item waits at the boundary. A failed next item reports an error and stops automatic advance. Preview stays independent and muted. Short ranges clamp fades to half the range. In sequential playback, a prepared next cue replaces the current cue's exit fade.

## Language and performance

English is default; Português (Brasil) can be selected during playback. Automatic hardware decoding and CPU decoding are available in Settings after restart. Codec/profile/driver support varies. Cuts forward native shared frames; transitions currently convert and compose frames in CPU, once per Program. GPU composition, remote control, scheduling and production AV-sync/performance validation are future work. Layout samples are demonstrations, not actual playback.
