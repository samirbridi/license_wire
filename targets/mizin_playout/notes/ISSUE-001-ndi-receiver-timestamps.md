# ISSUE-001 — Intermittent NDI receiver video timestamps

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
