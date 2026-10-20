# Minimal Live Desk and resource footer — v0.12.1 (build 0032)

Compiled source `ab9b1cb480829c00519d49f8b64e25db6577f109`; executable SHA-256 `d4a28df609b0894aaccd428575987890c840e3150322a9b058995c754f530393`. Version/build/changelog are generated automatically from real target commits. Candidate build 0031 passed 72 native UI checks; the visual review led to clearer native arrows and larger footer text in build 0032. The prior candidate package, raw UI evidence and all 39 boards are preserved; no failed result was replaced. Prior build-0030 executable and boards are retained under binaries/preserved/build-0030/.

## Delivered

All TAKE widgets share one 40px row: destination, add Program, CUT, FADE, duration, Black and Loop. Labels are separate. Both Manual/Sequential states use identical typography/padding and reserve translated label width; tests exercise selection and actual styled text bounds. This corrects the two defects shown by the user, which the earlier bottom-only geometry test did not cover.

Add media groups file/folder imports; More groups Duplicate/Remove; arrows reorder cues. Cue/Edit/Copy A remain directly visible. Horizontal audio meters and single-line display/network summaries replace tall status tiles. Independent Programs, multiview, source-readiness and explicit output activation are retained.

A persistent footer exposes actual normalized process CPU, working-set RAM and optional busiest observed process GPU engine. Sampling uses Windows OS counters on a serialized worker at about 1 Hz; missing/first/failed/stale values remain unavailable. FPS counts the selected Program's publications/s and Mix is last CPU transition composition time. These are not physical display FPS, full render time or GPU decoder identity. Diagnostic JSON includes process_usage. API/provider/limitations: [ADR-012](../notes/ADR-012-minimal-desk-and-process-usage.md).

## Validation

| Suite | Automatic decode | CPU decode |
| --- | --- | --- |
| ui | 72/72 PASS | 72/72 PASS |
| readiness | 24/24 PASS | 24/24 PASS |
| transport | 31/31 PASS | 31/31 PASS |
| smoke | 7/7 PASS | 7/7 PASS |
| output | 19/19 PASS | 19/19 PASS |
| gpu | 21/21 PASS | 21/21 PASS |
| network | 38/38 PASS | 38/38 PASS |

**144 UI checks passed; 424/424 overall functional checks passed.** Observed network failures:

- No failure observed in this bounded run; ISSUE-001 remains open pending diagnosis/qualification.

No network timestamp implementation was changed. Existing ISSUE-001 is not closed by a passing bounded run. Real metrics extracted from engine reports are retained in [process-usage-0032.json](process-usage-0032.json); raw engine reports also contain provider, sample timestamps, interval and nullable GPU engine data. Values are snapshots, not a load benchmark.

The UI regression checks selected/unselected label sizing, all seven control coordinates, footer fit in EN/PT-BR at 1600x1000 and 1280x800, real self PID/CPU/RAM, observed-or-null GPU and stale fallback. More menu actions duplicate/remove actual cue metadata. Independent live Programs, middle removal, display mirrors, show restore and paused view restoration remain checked. Four version-policy tests, 299 matching nonempty catalog keys, eight fixture hashes, 39 board sizes/hashes and original brand pixels were verified. Eight boards explicitly select Sequential, across one/five Programs and both sizes/locales.

## Reproduction

```powershell
.\targets\mizin_playout\scripts\build.ps1
.\targets\mizin_playout\binaries\qa\precheck-dynamic-ui.ps1 -Build 0032
.\targets\mizin_playout\binaries\qa\capture-minimal.ps1 -Build 0032
.\targets\mizin_playout\binaries\qa\run-dynamic-programs.ps1 -Build 0032 -Resume -ContinueOnFailure
```

Network loopback requires the existing sandbox network exception; no firewall changes are made. [Suite index](dynamic-program-suites-0032.json) preserves exact native args, state/fixture/log paths, process exits and package hashes. [Manifest](validation.json) and [immutable snapshot](minimal-usage-validation-0032.json). Build/raw helper logs live under ignored binaries/qa/. Native selected-mode captures use --board --capture-sequential --board-programs 1/5 --lang en/pt-BR --capture-size 1600x1000/1280x800 --capture-dir <folder>.

## Scope

Local Windows/generated fixtures and widget actions only. Physical displays/audio/AV-sync, external LAN, AMD, other OS, maximum load and long shows remain outside this qualification. 64 Programs/128 routes remain allocation guards. Demo art/meters/READY are labelled; process resources are actual reads, and sample FPS/Mix stay unavailable. Transitions remain CPU composition; optional GPU scaling is separate.
