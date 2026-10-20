# ADR-003 — MAIN / EDIT and manual CUT / FADE

Date: 2026-10-20. Status: implemented and functionally validated in build 0010.

MAIN is the operator workspace: Preview, independent Programs, running order, destination and explicit CUT/FADE buttons. EDIT owns a second view of the same muted Preview channel and the In/Out/sequence transition fields. Changing pages does not replace the channel/controller objects or reopen the Program media. Editing uses explicit Apply cue / Reset edits; draft fields are not applied implicitly by manual switching or project saving.

PlaylistController::takeManual creates a temporary launch cue. CUT sets that launch's transition and entry fade to zero. FADE uses Dissolve plus the chosen manual duration, including an entry fade from black for an empty destination. Manual duration defaults to 300 ms (1–10000 ms), stored as manualFadeMs in the portable computer preferences. Original cue settings remain in the order snapshot for the next sequential/repeated occurrence. The saved In/Out and exit fade are retained.

The operator must prepare the selected cue in Preview. Manual controls are unavailable if selection and preparation differ; Ctrl+Enter/Ctrl+Space dispatch CUT/FADE only on MAIN. Incoming Program media is still prepared in a muted native deck before promotion: CUT means no transition envelope, not a guarantee of zero file-load latency. Existing failure preservation and short-range fade clamping remain in effect.

Validation: seven native smoke checks, twenty-three transport checks and eight in-process Qt UI checks in each of CPU and automatic decode modes (76 functional checks total). The UI checks invoke real widget actions with native synthetic media, covering page separation, default timing, manual dispatch, destination B, preferences, editor continuity and language switching. This is not OS pointer interaction, a physical output test or a high-resolution performance qualification. Transitions continue to use the shared CPU reference compositor.
