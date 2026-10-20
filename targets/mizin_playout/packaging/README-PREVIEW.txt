MIZIN PLAYOUT - WINDOWS X64 PRIVATE PREVIEW

Run MizinPlayout.exe for per-user settings. English is the default; choose
Portugues (Brasil) in the app. Use Start portable.cmd for settings in state/.
Videos remain in their original folders; save your show with Save show.

Windows 10 22H2 / Windows 11 x64 and Microsoft Visual C++ v14 x64 runtime are
required. The official signed installer is in prerequisites/vc_redist.x64.exe.
The setup offers it if the installed runtime is too old. It may request Windows
administrator permission; Mizin Playout itself runs as the current user.

NDI is optional and requires the official NDI runtime installed separately:
https://ndi.video/for-developers/ndi-runtime/
NDI is a registered trademark of Vizrt NDI AB. No NDI DLL is bundled.
OMT native runtime is included. Network senders start only when requested.

Read docs/quick-start.en.md or docs/quick-start.pt-BR.md. Exact build/source and
file hashes are in build-info.json and package-manifest.json. Dependency notices
and SDK SBOMs are in licenses/. Original application source is in source/.
Qt and FFmpeg dynamically linked binaries can be replaced by compatible builds.

This private preview is unsigned. Public distribution, a clean-machine test,
complete corresponding dependency source/rebuild validation and production
physical display/audio/network qualification remain pending. ISSUE-001 tracks
intermittent NDI receiver timestamp tests. GPU composition and remote control
are planned; transitions currently compose on CPU.

Uninstall removes known application files, keeping user preferences and media.
