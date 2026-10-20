# Event output configuration — v0.9.1 (build 0026)

Source: `0b885f2d374bf0ddf4727d95db4b023f4920b6a3`. Package SHA-256: `0700346c551e6ebc7317a35c8b8347d2079c5efeda24f9e8b6d887aac8b32085`.

Every launch defaults to one Program and one configured display route. MAIN shows Preview / PROGRAM; + Add Program enables B. Outputs → Displays adds up to three routes (new routes mirror A) or removes the closed last route. Capacity remains two independent Programs / three display routes. Displays and digital senders still require explicit start/open.

Schema-3 show files save counts and route Program sources. Schema-1/2 files migrate to a single Program/route. Malformed configurations reject atomically. Removal requires Black B and closed/stopped display/digital outputs; paused/loaded/preparing media blocks removal. Loading a show that would remove active resources is rejected before changing the playlist. Adding idle B preserves real playback on A.

| Suite | Automatic decode | CPU decode |
| --- | --- | --- |
| readiness | 24/24 PASS | 24/24 PASS |
| ui | 46/46 PASS | 46/46 PASS |
| smoke | 7/7 PASS | 7/7 PASS |
| transport | 28/28 PASS | 28/28 PASS |
| network | 37/38 FAIL | 38/38 PASS |
| output | 19/19 PASS | 19/19 PASS |
| gpu | 21/21 PASS | 21/21 PASS |

**365/366 native checks passed on the same executable. Output configuration/UI checks pass; overall engine/network validation is not fully green.** Strict NDI receiver timestamp monotonicity failed again in this final build; current network result JSON records the failure. No final-build retry was used to hide it. See ISSUE-001 for the unresolved risk. During build 0025, the first network/auto run could not connect the local NDI receiver under sandbox restrictions; that package passed outside the sandbox. One build-0025 CPU receiver timestamp-monotonicity check also failed once and passed a bounded repeat. The timestamp intermittence remains unresolved; the final UI badge correction does not change the network implementation. Original failures and indexes are retained as network-auto-0025-sandbox-attempt.json, network-cpu-0025-first-attempt.json and output-configuration-first/second-attempt-0025.json. Four version-policy tests passed. Catalogs contain 272 matching, nonempty EN/PT-BR keys. Eight fixture hashes and the development package manifest were verified. Twenty-six native demo boards were checked for dimensions, hashes and identical brand pixels. Native UI checks cover single/dual MAIN at 1600×1000 and 1280×800 in both languages, route capacity/guards, OMT sending removal guard, preserved playback and actual .mizinshow save/restore. Exported diagnostics retain null unknowns and disabled flags.

## Reproduction

From the repository root, PowerShell:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File './targets/mizin_playout/scripts/build.ps1'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File './targets/mizin_playout/binaries/qa/run-output-configuration.ps1' -Build 0026 -ContinueOnFailure
powershell.exe -NoProfile -ExecutionPolicy Bypass -File './targets/mizin_playout/scripts/capture-boards.ps1'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File './targets/mizin_playout/scripts/capture-boards.ps1' -MultiOutput -Directory 'D:/REA - ENGENHARIA REVERSA/targets/mizin_playout/design/boards/multi-output'
```

Exact native test argument strings, fixture/state/log paths, package hashes and process exits are in output-configuration-suites-0026.json. Local runners and raw logs are preserved under ignored binaries/qa/. Re-running uses new build-specific result paths to preserve prior evidence. Native individual compact MAIN captures use --board --capture-size 1280x800 --capture-page 0 with --lang en / pt-BR and a compact capture directory.

Previous executables/layouts are preserved under binaries/preserved/build-0024-20261020-152328/ and binaries/preserved/build-0025/; build-0024 boards also remain in design/archive/build-0024/. Latest validation and immutable output-configuration-validation-0026.json contain per-file hashes.

## Scope

Windows local synthetic media, in-process Qt widget actions and local NDI/OMT loopback. Demo boards use labelled sample art/meters. Real QWidget::render captures may omit hardware video surfaces and are UI-state evidence only. No new physical-monitor signal, external LAN, AV-sync, AMD, remote-control or GPU-transition-compositor qualification. B's native objects remain allocated while inactive; this change does not claim a measured memory/CPU reduction.

Per-event persistence covers counts and source mapping. Physical display endpoints, scaler/audio preferences and active sender/window state retain their existing independent behavior. Shows reopen without opening outputs or starting senders. Next engine milestones remain GPU composition with CPU fallback, layers and authenticated remote control.
