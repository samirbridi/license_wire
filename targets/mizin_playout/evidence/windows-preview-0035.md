# Windows x64 private preview — v0.14.1 (build 0035)

Source `18df4d67f50848be0c59f5b6cddd531d2a9125e1`; EXE SHA-256 `9f1bed8f3c750e9a9e06fb59d41c94ca1845121e43a1f6bc064599848f6e2019`. Automatic commit-driven version/changelog, Windows resources and package metadata agree. Build-0033/0034 executable folders are preserved under binaries/preserved/. Release folders are immutable.

## Delivered

Per-user Unicode installer (English/PT-BR) and portable ZIP; original approved icon in EXE/Setup; default per-user preferences, explicit portable/override paths and guarded legacy preferences copy. Explicit dependency/plugin allowlist excludes state, SDKs and QA fixtures. The signed official Microsoft VC++ prerequisite, OMT, dependency notices/SDK SBOMs, exact FFmpeg configuration, app source archive and per-file hashes are included. NDI remains optional/separate. No firewall, service, startup or codec changes.

| Artifact | Bytes | SHA-256 |
| --- | --- | --- |
| MizinPlayout-0.14.1-build0035-windows-x64-preview-setup.exe | 47377789 | `3531d42f940e869be0aa674ae2326c35235f2c1bdf26173d2d131a7aa5424c15` |
| MizinPlayout-0.14.1-build0035-windows-x64-preview-portable.zip | 47204361 | `8343dfa2cf2e2cfd50e98aa6c20773b61e6cf781cfab0b1a25f58663eedca9af` |

Artifacts are in `releases/MizinPlayout-0.14.1-build0035-windows-x64-preview`; payload inventory has 53 files including its manifest. Private preview is unsigned, with public_release_ready=false. Licensing/source provenance and remaining corresponding-source/rebuild work are explicit in the payload and release gates.

## Executed validation

- 39/39 package assertions passed: ZIP/setup and all payload hashes, EXE version, default/portable/override paths, no profile writes from metadata, no shipped developer/NDI state, own relocated Qt Core/Widgets/qwindows and no developer SDK DLL.
- 114/114 native checks passed from the extracted ZIP: UI 83 (auto), readiness 24 (auto), codecs 7 (forced CPU). H.264 MP4/MKV, H.265, MJPEG AVI and ProRes MOV use generated fixtures. PATH was reduced to Windows directories and Qt lookup variables cleared; this is not a clean-machine proof.
- Isolated silent /QA install/reinstall/uninstall passed. Unknown operator file and portable preferences survived with exact hashes. Known application binaries were removed.
- Normal per-user installation also passed: exact quoted UninstallString/QuietUninstallString and displayed version, real Start-menu shortcut, then cleanup by the real uninstaller. Existing installations were guarded against before this test. The shared VC++ runtime was already installed and was not modified.
- Four version-policy tests passed. NSIS /WX makes warnings fail; final compilation had no warning. The first build-0034 ZIP/isolated tests passed but NSIS reported malformed registry quoting; that candidate was held, preserved and corrected rather than released. Its report remains evidence/package-validation-0034.json.

Reports retain process exits, exact native arguments, module paths and state/log locations. Actual native captures/reports are copied beside this record; hardware video surfaces can be omitted by native widget rendering. [Combined manifest](validation.json), [immutable validation](windows-preview-validation-0035.json), [installer/ZIP details](package-build-0035.json), [package test](package-validation-0035.json), [toolchain provenance](packaging-toolchain.json).

## Reproduce

```powershell
.\targets\mizin_playout\scripts\build.ps1
.\targets\mizin_playout\scripts\setup-packaging.ps1
.\targets\mizin_playout\scripts\package.ps1
.\targets\mizin_playout\scripts\test-package.ps1 -ShellRegistration
```

Build increments from real commits; packaging consumes that build and refuses an existing versioned output directory. Logs for this run are binaries/qa/build-windows-package-0035.log, package-windows-0035.log and package-test-0035.log. Normal shell tests ran with the sandbox exception for their own temporary shortcut/registry entry, removed after verification. They do not alter a preexisting installation.

## Remaining gates

Validation tooling note: the first build-0035 report attempt was interrupted during
recursive serialization of a PowerShell registry-provider object. Its native
reports/log/work directory are retained in package-test-0035-attempt1.json. The
test-only fix 31f4372 records plain registry strings and a runner SHA-256; the final
39-check run completed with that validator. Shipped application/installer/ZIP bytes
were not changed. The app source ZIP correctly represents compilation commit
18df4d6; use the repository's current test runner to reproduce shell-report QA.

Clean Windows without SDK/VC++/NDI, missing-prerequisite UAC/reboot flow, signing, complete corresponding dependency sources/rebuild/relink, running-app/update failure cases, real outputs/AV-sync, AMD/other OS and external LAN remain unqualified. ISSUE-001 NDI receive timestamps is still open; network implementation did not change. The historical full 446-check matrix is build 0033, not rerun as this package's result. GPU transitions, show recovery/relink and authenticated remote control remain planned; [roadmap](../docs/release-roadmap.md).
