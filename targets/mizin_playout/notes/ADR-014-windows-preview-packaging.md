# ADR-014 — Windows x64 private-preview packaging

The user authorized continuing toward an actual build. The native application
already runs; this milestone adds reproducible installation/ZIP artifacts rather
than expanding playback features before a usable test package exists.

## Decisions

- Keep commit-derived version/build/changelog. Embed the same numeric and display
  versions, approved original icon and prerelease flag in Windows PE resources.
  Packaging cannot select a version and rejects a mismatched executable resource.
- Default settings move to Qt AppLocalDataLocation (Mizin / Mizin Playout), separate
  from binaries. First normal launch copies an existing adjacent preferences.ini
  only if no user profile exists; originals are retained. --portable selects
  adjacent state/; explicit --state-dir wins. --runtime-info exports resolved paths,
  version and source without opening the desk or creating a profile.
- Use pinned NSIS 3.13 ZIP, verified against the project's SHA-256. It runs from
  ignored target-private binaries/packaging and needs no machine installation.
  NSIS is free for commercial use; no compiler subscription/license is purchased.
- The Unicode installer runs as the current user, targets LocalAppData/Programs,
  offers English/PT-BR, and provides a Start-menu shortcut and HKCU uninstall entry.
  It creates no service, firewall rule, startup task or codec registration.
- Bundle the official signed Microsoft VC++ x64 redistributable, not developer CRT
  copies. Setup checks installed major/minor/build; an interactive missing-runtime
  path asks before invoking the official installer with elevation. Silent mode
  fails explicitly if a prerequisite is missing. No reboot is forced.
- Copy only an explicit runtime/Qt-plugin allowlist, operator guides, notices,
  SDK SBOMs, exact FFmpeg runtime configuration, original application source ZIP
  and automatic build metadata. Exclude state, fixtures, QA tools, SDKs and NDI DLLs.
  NDI remains an optional separately installed official runtime; OMT is included.
- Versioned releases/ paths are immutable. package-manifest.json hashes every
  payload file (except itself); external SHA256SUMS covers ZIP and installer.
- Uninstall deletes only compile-time known payload files and nonrecursive empty
  directories. It first rejects a locked running EXE, preserves unknown files and
  user profiles/media, and never removes the shared VC++ runtime.
- /QA suppresses shell/registry registration for isolated install/reinstall/remove
  checks; it does not skip copying, runtime detection or uninstall behavior.

## Qualification

Test the relocated ZIP with developer PATH/Qt lookup variables cleared, resolve all
three profile modes, verify PE version and every payload/artifact hash, execute
real UI/readiness/codec tests, inspect loaded module paths, and run the isolated
installer/reinstaller/uninstaller while asserting preference/media preservation.
Retain first-run failures and exact commands/logs. Do not equate PATH isolation
with a clean Windows machine. Normal shell registration, missing-prerequisite UAC,
signing, dependency corresponding-source rebuild, physical output/AV-sync and
external network qualification remain separate gates. This is a private preview,
not a public or production-qualified release. ISSUE-001 remains open.

## Primary references

- [Qt 6.10 Windows deployment](https://doc.qt.io/qt-6.10/windows-deployment.html)
- [Qt standard paths](https://doc.qt.io/qt-6/qstandardpaths.html)
- [NSIS license](https://nsis.sourceforge.io/Docs/AppendixI.html)
- [Pinned official archive/hash](https://sourceforge.net/projects/nsis/files/NSIS%203/3.13/nsis-3.13.zip/download)
- [NSIS script reference](https://nsis.sourceforge.io/Docs/Chapter4.html)
- [Microsoft VC++ redistribution](https://learn.microsoft.com/en-us/cpp/windows/redistributing-visual-cpp-files)

Qt/FFmpeg source/license texts and SDK SBOM provenance are retained in the package;
this record is technical scope, not a claim that public distribution review passed.

## Executed checkpoint

Build 0035 passed 39 package and 114 relocated UI/readiness/codec checks, including
normal current-user shortcut/uninstall registration and cleanup. See
evidence/windows-preview-0035.md. The native/package source is 18df4d6; the
test-only logging correction 31f4372 bounds registry details to plain strings and
records the validator hash. It does not rebuild or alter shipped binaries. The
source ZIP represents the actual compilation commit; use the current repository
test runner for shell-registration report generation. The first reporting attempt
was interrupted during recursive PowerShell-provider serialization and retained
separately; its functional outcomes were not substituted for the final passing run.
