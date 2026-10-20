# Local project and remote boundary

Schema 2 .mizinshow: JSON with library/folders string arrays and playlist cue objects. Each object has source, in_ms, out_ms (-1 = native end), transition (0 Cut / 1 Dissolve / 2 FadeBlack), transition_ms, enter_ms and exit_ms. The reader validates integer types, ranges and In < Out; the engine validates bounds against native duration. Duplicate source paths are allowed as separate cues. Older schema 1 string playlists migrate to default cue settings on read.

Save uses QSaveFile for an atomic commit. Open parses into a temporary Show and replaces the model only after all entries validate. Originals are referenced, never modified or deleted. Playback modes are session controls; cue settings persist in the show. Each Program retains the snapshot taken at its latest TAKE.

MAIN CUT/FADE use a temporary cue for the launch, preserving original per-cue transitions in the running-order snapshot. EDIT draft fields require Apply cue before they enter the model/schema-2 save. Manual fade timing is a computer preference (manualFadeMs, default 300), not a change to the show schema. Existing schema-2 transition durations are preserved; new cues default to 300 ms.

Output scaler profiles are computer preferences outputScaler0/1/2 (native or lanczos), applied when opening/updating a route. Screen identities are session-local references to currently detected QScreens; disconnected screens are removed instead of silently redirecting a route. The application does not change the system display mode. No new network API is exposed.

No HTTP/WebSocket/OSC listener is implemented or opened. Remote operator/observer authentication and a command/state protocol are future work; do not represent settings-page roadmap text as a working remote service.
