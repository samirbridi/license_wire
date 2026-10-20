# Decimal MB/GB, DXGI GPU memory and Composition — v0.13.0 (build 0033)

Compiled source `97949546b898d8eb697496cf89a3983842208be7`; executable SHA-256 `f69a0c1c575f5c893294ebe2aae2d1eeb0e83b9a29b64c406a33c69ef26f0fb4`. Version/build/changelog were generated automatically from real target commits. Previous build-0032 executable and all 39 native boards are preserved in binaries/preserved/build-0032/.

## Delivered

RAM is converted from exact working-set bytes to decimal MB or GB, switching at 1000 MB. English uses decimal points and PT-BR decimal commas. MB has one decimal, GB two. Measured zero and unknown/invalid values remain distinct. Old MiB labels were valid binary units; this is a numeric conversion, not a suffix replacement.

GPU shows engine activity % plus independently measured application graphics memory. DXGI QueryVideoMemoryInfo CurrentUsage queries LOCAL + NON_LOCAL bytes on node 0 of every hardware adapter. Software adapters are skipped; incomplete/unsupported inventory or query means unavailable aggregate. Per-adapter names/LUIDs/segments and exact bytes remain in diagnostic JSON. The sampler is read-only and stays on the serialized worker. It creates no D3D device and does not use known-problematic GPU Process Memory PDH counters. Linked multi-node configurations beyond node 0 remain outside scope.

Composition/Composição replaces Mix: last CPU time to combine one transition frame, in ms. This is distinct from the configured fade duration, full render latency and audio mixing. Existing player behavior, source readiness, transport, transitions, audio and outputs are unchanged. Units and DXGI semantics are documented with [primary references in ADR-013](../notes/ADR-013-decimal-units-and-gpu-memory.md).

## Validation

| Suite | Automatic decode | CPU decode |
| --- | --- | --- |
| ui | 83/83 PASS | 83/83 PASS |
| readiness | 24/24 PASS | 24/24 PASS |
| transport | 31/31 PASS | 31/31 PASS |
| smoke | 7/7 PASS | 7/7 PASS |
| output | 19/19 PASS | 19/19 PASS |
| gpu | 21/21 PASS | 21/21 PASS |
| network | 38/38 PASS | 38/38 PASS |

**166 native UI checks passed; 446/446 overall local functional checks passed.** Current network observations:

- No failure observed in this bounded run; ISSUE-001 remains open.

ISSUE-001 remains open; no network timestamp implementation changed. [GPU/process memory snapshots](gpu-memory-0033.json) are extracted from actual native diagnostic reports and retain exact segment bytes; values are point-in-time application usage, not a throughput benchmark. GPU % and bytes are independent.

New regressions cover 95 MiB to decimal MB, the 1 GB boundary, fractional GB, Portuguese separator, measured zero vs unknown/negative, complete-or-null per-adapter accounting, independent GPU activity/memory and stale-memory invalidation. High-GB injected test fixtures verify footer text/bounds in both locales at 1600x1000 and 1280x800; those injections are not shown as real board telemetry. Existing independent Programs/mirrors/show/transport checks remain. Four version-policy checks, 303 nonempty matching catalogs, eight fixture hashes, 39 native board dimensions/hashes and unchanged approved brand pixels passed.

## Reproduction

```powershell
.\targets\mizin_playout\scripts\build.ps1
.\targets\mizin_playout\binaries\qa\precheck-dynamic-ui.ps1 -Build 0033
.\targets\mizin_playout\binaries\qa\capture-minimal.ps1 -Build 0033
.\targets\mizin_playout\binaries\qa\run-dynamic-programs.ps1 -Build 0033 -Resume -ContinueOnFailure
```

Network loopback ran with the existing sandbox exception; no firewall change. Exact args, state/fixture/log paths, process exits and package hash are in [suite index](dynamic-program-suites-0033.json). [Current manifest](validation.json) and [immutable snapshot](decimal-memory-validation-0033.json). Build logs/helpers are retained under ignored binaries/qa/. Native widget capture flags remain --board / --board-programs / --capture-sequential / --capture-size / --capture-dir.

## Scope

Local Windows/generated fixtures and native widget actions. Not maximum concurrency, physical display/audio/AV-sync, external LAN, AMD/other OS, linked multi-node GPU or long-show qualification. Memory is process usage, not installed VRAM capacity; LOCAL memory is not universally dedicated VRAM on integrated GPUs. Source/sample graphics are labelled illustrative; resource bytes are actual OS reads. Unmeasured sample FPS/Composition remain unavailable. Transitions still use CPU composition; GPU scaling is a separate path.
