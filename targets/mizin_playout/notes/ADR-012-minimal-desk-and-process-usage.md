# ADR-012 — Minimal Live Desk controls and process usage footer

The user reported misaligned controls after the prior revision, text clipped in selected Sequential, and requested a vMix-like usage footer plus a more minimal workspace. Retain the accepted Live Desk A direction and original branding.

## Controls and organization

All TAKE widgets now share the same grid row and fixed 40px height: Program selector, add Program icon, CUT, FADE, duration spin box, Black and Loop. Labels occupy a separate row. This supersedes the previous bottom-only alignment check, which missed the centered Black/Loop geometry shown in the user's screenshot.

Both mode buttons use the same DemiBold font and padding in every state, with width reserved from the translated label/font metrics. The previous :checked-only font weight increased text width without reserving room. Regression measures selected text against actual styled contents, after changing mode, in EN/PT-BR at full and compact widths.

Add media groups file/folder imports; reorder arrows replace long Move up/down buttons; More groups Duplicate/Remove. Cue, Edit and Copy A remain visible. Compact, single-line display/network summaries and horizontal audio meters replace tall dashboard tiles. Actions and independent transport behavior remain accessible.

## Process resource sampling

ProcessUsage samples on a serialized QtConcurrent worker, approximately once per second; overlapping requests are skipped. The shared sampler outlives a window's pending task. Windows queries use current process GetProcessTimes (CPU time normalized by all active logical processors), GetProcessMemoryInfo (working set bytes), and optional PDH GPU Engine counters for this exact PID. GPU paths are localized through PdhAddEnglishCounter/GetCounterInfo, expanded, then individually added in the returned locale. Engine instances refresh every five seconds; values need two collections. Show the maximum valid process-engine utilization across adapters, not a sum of independent engine percentages. It is neither total system usage nor identification of a hardware decoder.

Failed/missing OS or driver counters remain JSON null. The first CPU interval has no rate. Older than 3.5s samples become unavailable rather than displaying stale values or invented zeros. No service, elevated process or vendor tool is started. Non-Windows implementation currently reports unavailable counters; platform-specific collectors remain future work.

The footer shows CPU %, RAM working set in MiB, GPU %, FPS and Mix. FPS is the selected Program's existing video publication count over the last second; it is not physical display FPS. Mix is the last recorded CPU transition composition time; an unmeasured value stays unavailable. Hidden pages and outputs do not change counter ownership. Engine diagnostic JSON gains a process_usage object without changing schema 2; decoder adapter/timing unknown fields remain null. Sample boards use actual process resource reads alongside clearly labelled illustrative media; sample FPS/Mix stay unavailable.

## Validation and boundaries

Validate full/compact EN/PT geometry in both mode states, all seven control top/height coordinates, footer fit, real CPU/RAM provider values, observed-or-null GPU data and stale-data fallback. Exercise Duplicate/Remove through their new menu, retain independent playlists/routes/playback tests, and capture selected Sequential at both sizes/locales for single and five Programs. Qualified hardware throughput, physical FPS/AV-sync, AMD and other operating systems remain separate. Existing ISSUE-001 stays open even if a bounded NDI run passes.

## Primary implementation references

- [GetProcessTimes](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-getprocesstimes)
- [GetProcessMemoryInfo](https://learn.microsoft.com/en-us/windows/win32/api/psapi/nf-psapi-getprocessmemoryinfo)
- [PdhAddEnglishCounterW and wildcard localization](https://learn.microsoft.com/en-us/windows/win32/api/pdh/nf-pdh-pdhaddenglishcounterw)
- [PdhGetFormattedCounterValue](https://learn.microsoft.com/en-us/windows/win32/api/pdh/nf-pdh-pdhgetformattedcountervalue)

These document API semantics, not this package's measured performance or physical output.
