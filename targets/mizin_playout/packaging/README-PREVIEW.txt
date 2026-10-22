MIZIN PLAYOUT - WINDOWS X64 PRIVATE PREVIEW

Run MizinPlayout.exe for per-user settings. English is the default; choose
Portugues (Brasil) in the app. Use Start portable.cmd for settings in state/.
Videos remain in their original folders; save your show with Save show.

Windows 10 22H2 / Windows 11 x64 and Microsoft Visual C++ v14 x64 runtime are
required. The official signed installer is in prerequisites/vc_redist.x64.exe.
The setup offers it if the installed runtime is too old. It may request Windows
administrator permission; Mizin Playout itself runs as the current user.

The official NDI runtime is included privately beside the app. No separate NDI
installation is needed. Its vendor license/third-party notices are in licenses/ndi.
https://ndi.video/
NDI is a registered trademark of Vizrt NDI AB.
OMT native runtime is included. Network senders start only when requested.

Read docs/quick-start.en.md or docs/quick-start.pt-BR.md. Exact build/source and
file hashes are in build-info.json and package-manifest.json. Dependency notices
and SDK SBOMs are in licenses/. Original application source is in source/.
Qt and FFmpeg dynamically linked binaries can be replaced by compatible builds.

This test preview is unsigned. A clean-machine test, bit-identical dependency
rebuild and production physical display/audio/network qualification remain pending.
Matching dependency source archive links/hashes are in dependency-sources.json. ISSUE-001 records
NDI connection-cache behavior and strict source/delivery validation. GPU composition and remote control
are planned; transitions currently compose on CPU.

Uninstall removes known application files, keeping user preferences and media.

Updates: Settings > Updates. Startup checks are automatic; downloads and installs
are optional. Read the changes, choose Download, then Install and restart when
Programs and outputs are stopped. Save your show first. No automatic quit-install.
Metadata is signed and downloads are verified before running the native installer.
Preferences, shows and operator media are preserved. See docs/quick-start.*.md.
