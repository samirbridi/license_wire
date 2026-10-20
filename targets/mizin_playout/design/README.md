# Native interface review

Six boards are exported by the compiled Qt application:

1. MAIN / Preview / Program A / Program B / CUT / FADE — English.
2. Output routing — English.
3. Media library — English.
4. MAIN — Português (Brasil).
5. EDIT / In/Out / sequence transitions — English.
6. EDIÇÃO — Português (Brasil).

Sample filenames, pictures and timecodes are deliberately marked as layout-preview content. They are not evidence of playback, decoder capability or frame rate. Actual media validation is stored separately under evidence/.

Direction: dark operator workspace, cyan for FADE/Preview and warm CUT identity, explicit destination and a compact manual transport. Editing has its own page and shares the muted Preview decoder. The boards remain open to visual review; technical implementation can continue independently of a visual freeze.

Capture command: scripts/capture-boards.ps1. Images will be in design/boards/ after the build. No screenshots from Azimuth are used as product assets.
