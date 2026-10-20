# Multiview, routing inventory and alignment — v0.11.1 (build 0030)

Compiled source: `d344e3100a0eb7948293af5d6898bad7bed1c480`. Executable SHA-256: `39a5b9cfdb0332c5d6b472e110da45ce88b5937cd5b2fc4b0cda1b14056c3ede`. Version/build/changelog were computed from real commits, not manually assigned. Source implementation: be4f76b (feature), d344e31 (compact/retained-frame/help fix).

## Delivered

One Program and one route remain the default. Additional Programs appear together in a responsive multiview beside muted Preview. A cyan outline indicates the playlist/TAKE destination; clicking a tile name changes selection without stopping playback. Play/pause and Black resolve that tile's stable Program identity. Views share existing frames and allocate no media decoder. Hidden monitors skip publications and restore the retained frame when shown. Larger grids scroll.

Outputs inventories every Program, independent playlist size and configured route numbers. No-display sources remain listed. Per-Program Add route creates a closed route assigned to that Program; the global action defaults to A for mirrors. Per-tab scrolling avoids inheriting network-panel height. Existing output reopening semantics remain unchanged. Route buttons align with combo fields; text has inset/wrapping, Fade duration has a fixed compact group and Manual/Sequential have explicit separation. Network tab and operator/F1 help now use NDI / OMT and the current dynamic Program flow.

## Validation

| Suite | Automatic decode | CPU decode |
| --- | --- | --- |
| ui | 55/55 PASS | 55/55 PASS |
| readiness | 24/24 PASS | 24/24 PASS |
| transport | 31/31 PASS | 31/31 PASS |
| smoke | 7/7 PASS | 7/7 PASS |
| output | 19/19 PASS | 19/19 PASS |
| gpu | 21/21 PASS | 21/21 PASS |
| network | 38/38 PASS | 38/38 PASS |

**110 native UI checks passed; 390/390 overall functional checks passed.** Current network failures:

- No failure observed in this bounded run; ISSUE-001 stays open pending diagnosis/qualification.

ISSUE-001 remains open; this stage changes no network timestamp implementation. No retry replaced a failing final result. Three Programs play independently in the fixture scenario; five-Program layout/inventory and five floating routes are exercised separately. Both locales/sizes check geometry. Middle removal preserves identity/routes/preferences; copied playlists, readiness guards and show restore remain covered. Paused retained-frame restoration is checked when returning to single view.

Four version-policy checks passed. 296 matched nonempty EN/PT catalogs, eight fixture hashes, 31 native sample PNGs, retained real-widget/report/show artifacts, package hashes and unchanged approved branding were verified. Compilation of build-0029 passed; its initial UI run passed 52/54 with two five-tile compact geometry failures. The raw result, log index and package are preserved; build-0030 is a separate corrected compilation.

## Reproduction and evidence

From repository root in PowerShell:

```powershell
.\targets\mizin_playout\scripts\build.ps1
.\targets\mizin_playout\binaries\qa\precheck-dynamic-ui.ps1 -Build 0030
.\targets\mizin_playout\binaries\qa\capture-multiview.ps1 -Build 0030
.\targets\mizin_playout\binaries\qa\run-dynamic-programs.ps1 -Build 0030 -Resume -ContinueOnFailure
```

Network loopback ran outside sandbox restrictions. Exact native arguments, exits, fixture/state/log paths and package hashes: [suite index](dynamic-program-suites-0030.json). Current [manifest](validation.json) and [immutable snapshot](multiview-validation-0030.json). The four version-policy cases use scripts/test_version.py. Board flags: --board --board-programs 5 --lang en/pt-BR --capture-size 1600x1000 or 1280x800 --capture-dir <folder>. Native samples are in design/boards/five-programs/. Build logs and QA helpers live under ignored binaries/qa/. Prior build-0028 boards/executable and build-0029 executable are preserved under binaries/preserved/.

## Remaining scope

64 Programs / 128 routes are allocation guards, not a qualified live capacity. Widget captures can omit hardware video surfaces; demo boards use labelled sample art/meters. This does not establish physical display/audio, external LAN, NDI timestamp/AV-sync, AMD, other OS or long-show performance. Transitions remain CPU composition; optional GPU scaling is independent. GPU transition composition and remote control remain future work.
