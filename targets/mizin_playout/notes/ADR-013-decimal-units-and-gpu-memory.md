# ADR-013 — Decimal memory units, GPU memory and Composition label

The user requested MB/GB instead of MiB, GPU activity plus memory, and an explanation of Mix. Keep process scopes and the minimal footer; retain the previous layout/alignment fixes.

## Units and labels

Format the existing RAM working-set byte count in decimal MB (1,000,000 bytes) or GB (1,000,000,000 bytes). Switch at 1000 MB. MB uses one decimal and GB two, with English/Portuguese decimal separators and no digit grouping. Zero is measured zero; null/negative/invalid values remain unavailable. This converts the value rather than renaming a binary unit: an exact 95 MiB is 99.61472 MB. Prior MiB values were correctly labelled binary units, not erroneous measurements.

GPU shows independently measured engine activity percent and process graphics-memory usage in MB/GB. These have different dimensions; memory is never calculated by multiplying an activity percentage by installed VRAM. Composition / Composição replaces Mix. It remains the last measured CPU duration to blend one transition frame; it is not the configured fade duration, audio mix, full render latency or GPU rendering time. Sample/unmeasured composition stays unavailable.

## GPU memory provider

Use DXGI QueryVideoMemoryInfo CurrentUsage directly for LOCAL and NON_LOCAL segments of node 0 on every enumerated hardware adapter. Skip software adapters. Cache the factory/adapter interfaces; invalidate when DXGI reports a changed adapter inventory. Queries run on the existing serialized sampler worker; no D3D device or third-party service is created. DXGI memory values are available immediately, separately from PDH engine activity's two-sample rate.

The aggregate is the sum of LOCAL + NON_LOCAL bytes across all queried hardware adapters. Every hardware query must succeed; partial/unsupported enumeration returns null aggregate rather than silently undercounting. JSON retains adapter names/LUIDs, node, availability and exact segment bytes. GPU memory is application usage, not total VRAM capacity; LOCAL is not universally dedicated VRAM on integrated GPUs. Linked multi-node adapters beyond node 0 are not qualified. Non-Windows collectors remain unavailable. Resource samples older than 3.5 seconds clear GPU-memory values too.

Use the direct DXGI API rather than GPU Process Memory PDH counters: Microsoft documents inaccurate per-process memory counters on some Windows 10 systems. Existing PDH engine activity stays unchanged. CPU/RAM providers and decoder/output ownership are unchanged. The sampler's DXGI budget is not presented as physical capacity.

## Validation

Test binary-to-decimal conversion, decimal GB boundary/fraction, English/Portuguese formatting, measured zero vs unavailable, independent percent/memory values, complete-or-null adapter accounting and stale fallback. Check the footer with high RAM/GPU GB values in both locales at 1600x1000 and 1280x800. Retain real process/provider and live Program/playout checks; export actual DXGI adapter readings. Injected values are test fixtures, not media-board telemetry. Native sample boards use actual process resource reads.

## Primary references

- [NIST binary and SI prefixes](https://physics.nist.gov/cuu/Units/binary.html)
- [DXGI QueryVideoMemoryInfo](https://learn.microsoft.com/en-us/windows/win32/api/dxgi1_4/nf-dxgi1_4-idxgiadapter3-queryvideomemoryinfo)
- [DXGI CurrentUsage in bytes](https://learn.microsoft.com/en-us/windows/win32/api/dxgi1_4/ns-dxgi1_4-dxgi_query_video_memory_info)
- [DXGI memory segment groups](https://learn.microsoft.com/en-us/windows/win32/api/dxgi1_4/ne-dxgi1_4-dxgi_memory_segment_group)
- [Microsoft's GPU Process Memory counter issue](https://learn.microsoft.com/en-us/troubleshoot/windows-client/performance/gpu-process-memory-counters-report-wrong-value)

API references establish semantics, not physical-output or universal-driver qualification.
