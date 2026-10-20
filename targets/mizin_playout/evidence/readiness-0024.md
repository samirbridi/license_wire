# Source READY and Engine diagnostics — native delivery

Date: 2026-10-20. Package: **v0.8.0 (build 0024)**. Compiled source: **4c614f9058e8badf1e322c11ea4775036c0a7677**.

This is the first approved evolution stage inspired by CasparCG concepts. It adds a generation-bound source/trim check and observable diagnostics to the original Qt/FFmpeg engine. The accepted A — Live Desk layout remains the operating surface. GPU composition, layers and remote process separation remain later stages.

## Delivered behavior

- READY/PRONTO verifies the selected, cued file and applied In/Out in muted Preview. Video proof uses a decoded timestamp at/after In within the existing 2 ms tolerance and before Out. The auto test verified a real frame at **400000 microseconds** for In = 400 ms.
- Missing, unreadable, corrupt, out-of-range, replaced, cancelled and modified sources cannot reuse READY to enable CUT/FADE. A final size/mtime/readability check runs on TAKE. Only applied trim changes revalidate; drafts preserve the applied model.
- EDIT retains full-range scrubbing. A failed Preview check does not command either live Program to stop. Programs retain their existing own-deck preparation on TAKE and sequential preroll; READY is not an armed Program or zero-delay guarantee.
- Audio-only checks use backend loaded/buffered/seek state. They do not certify a decoded first PCM sample. Sources without usable video timestamps cannot qualify the video In proof.
- Settings / Engine diagnostics shows actual channel/preparation state, metadata, frame publications, reported backend buffer progress, CPU composition measurements and existing A/B NDI/OMT counters. Unknown decoder adapter/timing/drop/queue values stay null / Not available.
- A local JSON export includes version, UTC, requested decode mode, language, readiness, channel snapshots, sender counters and output-window state. Clicking diagnostics does not stop playback or activate outputs. No remote command service is added.

## Current validation

| Suite | Automatic | CPU | Total |
| --- | --- | --- | --- |
| Source readiness and engine metrics | 24 | 24 | 48 |
| Native UI | 25 | 25 | 50 |
| Media/channel smoke | 7 | 7 | 14 |
| Trim/transition transport | 23 | 23 | 46 |
| Output/scaling | 19 | 19 | 38 |
| GPU SDR scaling | 21 | 21 | 42 |
| Audio / NDI / OMT loopback | 38 | 38 | 76 |
| Total | 157 | 157 | **314** |

All fourteen suites passed on the same packaged executable. Native UI checks include both languages at 1600×1000 and 1280×800, actual READY, export with null unknown metrics, applied nonzero In, stale selection blocking and failed preparation preserving A/B. The source suite additionally covers actual corrupt media, rapid recues, cancellation, external Preview replacement, source modification, generated PCM WAV, full-range editor seeking and real CPU transition timing. Synthetic fixtures and loopbacks bound this evidence; they do not certify arbitrary media or a live show.

Four version-policy tests passed. The catalogs have 259 matching nonempty keys; eight retained fixture hashes were checked. Fourteen native demo boards were captured with dimensions, brand pixels and hashes verified. Four live UI-state PNGs and two exported real JSON reports are retained separately; see [validation.json](validation.json), [immutable stage snapshot](readiness-validation-0024.json) and [suite/command index](readiness-stage-suites-0024.json).

The live widget PNGs can omit hardware video surfaces under QWidget::render in the test environment. They establish visible widget state, not displayed video pixels. Real frame timestamps, media dimensions and measured CPU composition are separately present in the source-test JSON. Demo boards use explicit Sample READY and Sample cells to avoid inventing telemetry.

## Package and reproducibility

Executable SHA-256: `d11e8b7a7e13f4b9d4154ffe8f23fdba847cc5837ffce8830f8e7d4858a97c6c`.

Package: 30 files, 66,319,255 bytes excluding runtime state. All file hashes are in validation.json. No installer was published. The previous native executable is preserved locally in binaries/package-archive/build-0023/. The prior twelve boards are preserved in design/archive/build-0023/.

Commands executed from the repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\targets\mizin_playout\scripts\build.ps1'
powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\targets\mizin_playout\binaries\qa\run-readiness-stage.ps1' -Build 0024
powershell.exe -NoProfile -ExecutionPolicy Bypass -File '.\targets\mizin_playout\scripts\capture-boards.ps1'
& 'C:\Users\Avell Mizin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m unittest discover -s targets/mizin_playout/scripts -p test_version.py
& 'C:\Users\Avell Mizin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' '.\targets\mizin_playout\binaries\qa\record-readiness-stage.py'
```

The local harness starts each packaged native test hidden with explicit fixture/result directories and a fresh state directory. CPU runs add --cpu. The tracked suite index includes every exact native argument string, log path, package hash, version and exit code. --readiness-test uses binaries/ as its fixture root; --ui-test, --smoke-test and --transport-test use binaries/fixtures; --output-test and --gpu-test use binaries/resolution-fixtures; --network-test uses binaries/network-fixtures. Local harnesses and raw logs remain under ignored binaries/qa/. Result files are never silently reused.

Compact MAIN uses --board --capture-page 0 --capture-size 1280x800, explicit en/pt-BR, design/boards/compact as the destination and binaries/board-state as state. Engine boards use --capture-diagnostics and explicit locale. All previous artifacts were copied to their archives before the new captures/package.

The existing build automation generated VERSION, CHANGELOG, source linkage and PASS status from the structured feature commit. No semantic version was assigned manually.

## Boundaries and next stage

GPU tests qualify the bounded existing SDR scaler on the detected NVIDIA renderer; they do not add GPU transitions or qualify AMD/Intel. Local receiver loopbacks do not qualify a separate LAN, physical audio, AV sync or production uptime. Publication counts and window geometry are not physical signal/FPS measurements. Preview source READY does not validate every packet of the whole file.

Next: use these diagnostics to establish a compositor baseline, then implement GPU composition with CPU fallback, followed by basic layers and remote engine/control separation. See [ADR-008](../notes/ADR-008-source-readiness-and-diagnostics.md) for metric and readiness definitions.
