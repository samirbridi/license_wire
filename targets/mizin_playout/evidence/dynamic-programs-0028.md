# Dynamic Programs, playlists and approved logo — v0.10.1 (build 0028)

Compiled source: `fe641f91021ed5bd755a3a369fe4bb8e1d42dcba`. Executable SHA-256: `3eacc647c0cd1b6d80f28a8f7dd6710eb506785c78a477f147486b960b074ea8`. Local development package: 30 files, 66388887 bytes; it is not a signed installer or production qualification.

## Delivered

One main Program and one route remain the default. Extra Programs allocate native channels/controllers/network buses only when added/restored; extra routes mirror an enabled Program without opening another decoder. MAIN selects its own playlist/transport, keeps A visible and shows the selected extra monitor. Copy A playlist fills an empty list with independent cue copies and refuses to overwrite existing items. Program switching clears source readiness and blocks unapplied drafts, without Black/reload commands to live Programs. Middle removal preserves surviving stable identities/preferences and remaps route indexes safely. Busy resources and the main Program cannot be removed.

Schema 4 stores stable Program IDs/names, all applied playlists and route sources. Schema 1/2 migration keeps their cues; schema 3's shared playlist becomes independent per-Program copies. Invalid cue/ID/count/source data rejects atomically. Show load does not auto-open windows or start senders. Background folder imports stay associated with their target Program ID; switching shows waits for a pending import.

The user selected logo proposal **A**. Three original built-in image_gen boards and full prompts are preserved under design/branding/proposals/2026-10-20-r1/. The selected M/play direction is redrawn as original SVG/QPainter paths in design/branding/mizin-playout-symbol.svg and brand.hpp, used by the rail and native window icon. The raster approval board is not embedded in the application. Executable/installer icon-resource packaging remains separate.

## Validation

| Suite | Automatic decode | CPU decode |
| --- | --- | --- |
| ui | 42/42 PASS | 42/42 PASS |
| readiness | 24/24 PASS | 24/24 PASS |
| transport | 31/31 PASS | 31/31 PASS |
| smoke | 7/7 PASS | 7/7 PASS |
| output | 19/19 PASS | 19/19 PASS |
| gpu | 21/21 PASS | 21/21 PASS |
| network | 37/38 FAIL | 37/38 FAIL |

**84 native UI checks passed; 362/364 overall functional checks passed.** Both network failures are the existing strict NDI receiver timestamp-monotonicity check, despite received video/audio. ISSUE-001 remains open. No retry replaced final FAIL results. No network implementation change or all-green network qualification is claimed.

The functional scenario exercised three Programs, independent lists and five floating routes, including mirrors, a third independent channel, copied metadata isolation, per-Program Manual/Sequential flags, active-removal guards, a middle Program removal and actual schema-4 save/reload. MAIN fit checks passed in EN/PT-BR at 1600×1000 and 1280×800. Four version-policy tests, 284 matched nonempty catalog keys, eight fixture hashes, 26 board dimensions/hashes/identical brand pixels, 14 real widget/report/show-file artifacts, three original logo boards and the SVG were checked. Build 0027 failed compilation on a qBound overload; the recorded fix produced build 0028. Build history retains the failed attempt.

## Reproduction and retained evidence

From the repository root, PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File './targets/mizin_playout/scripts/build.ps1'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File './targets/mizin_playout/binaries/qa/precheck-dynamic-ui.ps1' -Build 0028
powershell.exe -NoProfile -ExecutionPolicy Bypass -File './targets/mizin_playout/binaries/qa/run-dynamic-programs.ps1' -Build 0028 -Resume -ContinueOnFailure
powershell.exe -NoProfile -ExecutionPolicy Bypass -File './targets/mizin_playout/scripts/capture-boards.ps1'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File './targets/mizin_playout/scripts/capture-boards.ps1' -MultiOutput -Directory 'D:/REA - ENGENHARIA REVERSA/targets/mizin_playout/design/boards/multi-output'
```

Exact native args, fixture/state/log paths, process exits and package hashes are in dynamic-program-suites-0028.json. The precheck's actual auto-UI result is retained and skipped by the full runner. Local helpers/raw logs live in ignored binaries/qa/. Network loopback ran outside sandbox restrictions. Re-running requires fresh result/state paths; current evidence is preserved. Native compact MAIN captures use --board --capture-page 0 --capture-size 1280x800, --lang en / pt-BR and design/boards/compact/.

Current and immutable snapshot manifests: validation.json / dynamic-program-validation-0028.json. Previous build-0026 package/layouts are preserved in binaries/preserved/build-0026/ and design/archive/build-0026/.

## Practical limits and next work

64 Programs / 128 routes are defensive metadata/allocation guards, not tested concurrent-playback capacities. The measured functional proof is three Programs/five floating routes. Media/hardware/network and physical connectors determine usable concurrency. Demo boards are labelled sample art/meters; QWidget::render state captures may omit hardware video surfaces. This stage does not qualify physical displays, AV-sync, external LAN, AMD, maximum load or long shows.

Transitions still use CPU composition; optional GPU scaling is separate. Investigate ISSUE-001 before qualifying event network output. GPU transition composition with CPU fallback follows the dynamic ownership structure; layers, authenticated remote control and other platforms remain future stages.
