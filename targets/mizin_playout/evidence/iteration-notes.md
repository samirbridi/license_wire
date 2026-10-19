# Iteration record — 2026-10-19

The current milestone is identified by `validation.json`, its executable SHA-256 and source commit. Build status in build-history means compilation/dependency deployment; functional results are separate.

- Build 0006 compiled, but the existing smoke runner crashed. Its log showed that smoke.cpp had not been recompiled after NativeChannel's header layout changed. The generated MSVC/NMake dependency file omitted header dependencies. The build now uses `--clean-first`; the crash did not recur in subsequent smoke tests. A debugger stack observation is retained in `debug-transport-0006.log`.
- The initial trim transport run failed to publish trimmed frames; `transport-cpu-0006.json` retains those results. Build 0007 passed the existing CPU smoke suite. The trim preparation needed to await seekability rather than reject a transient metadata state. Diagnostic transport runs awaiting timeouts were stopped before continuing, and are not counted as passing tests.
- Build 0008 passed all 16 initial CPU transport checks. The interface review exposed a crowded running order and truncated In/Out column, which were revised.
- Build 0009 added checks for looping only the trimmed range and for stopping advance when the next item fails. Seven smoke checks plus eighteen transport checks passed in each of CPU and automatic decoding modes, totaling 50 checks. The small synthetic fixture scope and unvalidated production conditions are listed in `validation.json`.

Previous boards and the build-0005 validation manifest are retained. The final four boards were exported by the native Qt renderer. Pixel checks confirm that each file contains its brand and header; external image preview caching occasionally showed an incomplete old rendering, so the underlying file dimensions/hash/pixels were checked directly. These boards contain labeled sample content, not physical-output playback evidence.

Reference collection downloaded official READMEs and licenses to isolated `ffplayout` and `casparcg_server` targets. An initial raw wiki URL returned HTTP 404; the official AMCP HTML page was collected instead and its successful URL/hash is in that reference's manifest. No upstream implementation code or application binaries were imported for this reference study.
