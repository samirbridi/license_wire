# ISSUE-001 — Intermittent NDI receiver video timestamps

## Investigation on 2026-10-21

An independent receiver process reproduced the failure on unchanged build 0035:
89 video frames, 157 audio packets, nonzero audio; the first two video frames had
the same application timecode `15698410`, while SDK timestamps advanced from
`17926284475324225` to `17926284475657558` (one 30fps interval).
See `evidence/ndi-external-baseline-0035.json` for the raw trace.

A controlled SDK sender/cache experiment isolated connection-time replay of the
initial frame: explicit timecodes with an already primed sender reproduced the
duplicate; the documented `NDIlib_send_timecode_synthesize` policy did not.
Explicit timecodes without priming also passed. Both modes sent/received real
frames; `evidence/ndi-timecode-experiment-0035.json` retains the separate cases.

The new implementation requests SDK synthesis for both video and audio, keeping
the matched existing 40ms publication delay and OMT timestamps unchanged. Native
tests now log bounded raw video traces, keep strict monotonic checks and verify
the private bundled runtime path. Cold/late/reconnection validation is recorded
separately below after execution. The historical observations below are retained.

Status: OPEN. Observed during regression for event output configuration (builds 0025 and 0026). This has not been fixed by the output configuration or UI badge changes.

The local NDI loopback test sometimes receives valid 1920×1080 video and stereo audio but fails strict receiver video timecode monotonicity. Build 0026 automatic mode recorded 11 video frames, 18 audio packets and a nonzero audio peak. Those values meet all other conditions in `ndi_loopback_receives_native_video_and_audio`; the remaining false condition is the receiver's strictly increasing video timecodes. Raw per-frame timecode pairs are not currently logged, so the precise duplicate/reordering/source cause is not established.

Evidence:

- `evidence/network-cpu-0025-first-attempt.json`: the same condition failed; one bounded repetition passed on the same executable.
- `evidence/network-auto-0026.json`: reproduced in the final package, retained as FAIL; no retry to replace this failure with a pass.
- `evidence/output-configuration-suites-0026.json`: exact command lines, package hash, mode, exit status and native log paths for all final suites, including failures.
- `evidence/network-auto-0025-sandbox-attempt.json`: a separate initial failure to connect under sandbox restrictions; an unsandboxed run connected. This is distinct from the received-frame timestamp issue.

The existing network test instantiates channels/buses directly, without MainWindow or its Program/display configuration. No network implementation changes were introduced in this feature. That does not establish the root cause; the timestamp issue remains part of the product's open network validation.

Next investigation: record bounded sender/receiver frame IDs and timecode pairs; establish whether timestamps repeat, regress or are synthesized by the receiver; compare against OMT and source publications; qualify behavior on an independent receiving computer. Do not relax the strict check or claim frame-order/AV-sync qualification without evidence.

One-output defaults, B activation, mirror routes, removal guards and show persistence passed their native UI/model checks. Overall network regression is not fully green. Physical AV sync and event/production use of NDI still require qualification.


Build 0028 reproduced the strict receiver timestamp failure in both automatic and CPU modes, despite receiving video/audio. Raw evidence is in evidence/network-auto-0028.json and network-cpu-0028.json; no final-stage retry replaced those FAIL results. Dynamic Program/playlist, model, media and GPU/output suites passed. The issue remains OPEN.


Build 0030 current bounded regression: no failure observed; the known issue remains open pending diagnosis and independent qualification. Raw results and exits are retained in evidence/dynamic-program-suites-0030.json. No network implementation fix was introduced by the multiview/UI stage.


Build 0032 minimal-controls/resource-footer regression: no strict failure observed in the bounded run; issue remains open. Results/exits are retained in evidence/dynamic-program-suites-0032.json. No network timestamp implementation changes were made.


Build 0033 decimal-memory/DXGI footer regression: no strict failure observed in this bounded run; issue remains open. Results/exits remain in evidence/dynamic-program-suites-0033.json. No network timestamp implementation changed.

Build 0041 external receiver probes (2026-10-21, Claude Code session, host under load: another
session was rendering 4K with node/Chrome/ffmpeg, CPU ~81%): the NDI order checks this issue is
about passed in all three runs (startup-auto, late-auto 0.7 s, reconnect-cpu): zero order errors,
one verified exact cache repeat in reconnect-cpu. All three runs are still recorded FAIL because the
child `--network-test` exited 2 on audio-timing checks: `master_mute_reaches_both_network_receivers`
(all runs), `master_unmute_restores_both_network_receivers` (late-auto) and
`omt_loopback_receives_native_video_and_audio` (startup-auto: 7 audio packets). Network/audio source
is unchanged since build 0038, whose same probes passed. Not retried to replace the FAILs; repeat on
an idle machine before treating the network suite as green. Evidence:
`evidence/ndi-external-*-0041.json`, `evidence/network-probe-*-0041.json`.

Build 0044 (2026-10-22, host idle at ~10% CPU): the same three external probes (startup-auto,
late-auto 0.7 s, reconnect-cpu) all PASS, child `--network-test` exit 0, including
`master_mute_reaches_both_network_receivers`/`master_unmute_restores_both_network_receivers` and OMT
audio. Network/audio source is unchanged since 0038, so the build 0041 audio FAILs are attributed to
host load (4K renders) rather than a regression; they remain recorded. The audio mute checks are
timing-sensitive under heavy CPU load, which is itself a note for show machines. Issue stays OPEN
pending an independent LAN receiver. Evidence: `evidence/ndi-external-*-0044.json`.

Build 0049 (2026-10-22, host 30–70% CPU from another IDE): external probes in auto mode received only
~9–10 silent audio packets (video fine, child exit 0); reconnect-cpu varied. Same-condition A/B with
`binaries/qa/ndi-external-compare.py` (MIZIN_PROBE_EXE) shows build 0044 failing identically
(`evidence/ndi-external-compare-startup-0044.json` vs `-0049.json`), so this is host-state/load
dependent, not a 0045–0049 regression. In-process `--network-test` A/B: 0044 5/5 PASS, 0049 3/5 PASS
(the two failures were `master_mute_reaches_both_network_receivers` during the CPU peak). Keep OPEN;
repeat on an idle host and on a second LAN machine.
