# Path to a usable Mizin Playout release

## Windows private preview — current implementation

- Native automatic/CPU media engine, dynamic Programs/routes and English/PT-BR.
- Real EXE icon/version resources, per-user profiles plus explicit portable mode.
- Automated immutable ZIP and per-user installer, exact build/file hashes.
- Dependency inventory, license texts, SDK SBOMs and original application source.
- Relocated native playback tests and isolated install/reinstall/uninstall checks.

Run scripts/build.ps1 after committing the source. Then run
scripts/setup-packaging.ps1 once, scripts/package.ps1, and scripts/test-package.ps1.
The artifact version comes from the build's real commits, never a command parameter.
See the latest evidence/package-latest.json and its package-validation build record
for executed results; a checklist item alone is not proof of a passing test.

## Before broader distribution

1. Test on clean Windows 10/11 x64 without Qt, Visual Studio or existing VC++/NDI
   runtime. Exercise prerequisite installation, normal shortcuts/uninstall entry,
   update from a prior version and program-running/locked-file behavior.
2. Complete dependency corresponding-source archive/build instructions and relink
   validation for exactly shipped Qt/FFmpeg binaries, plus binary notice audit.
3. Sign the app and installer when an authorized certificate is available. Current
   private preview is unsigned and can trigger Windows reputation prompts.
4. Qualify NVIDIA/AMD/CPU codec profiles, unsupported-media errors, long playlists,
   actual outputs, hotplug, audio endpoint changes and physical AV synchronization.
5. Resolve ISSUE-001 intermittent NDI receive timestamps and repeat external LAN
   NDI/OMT tests with real receivers under sustained load.

## Following product milestones

1. Show reliability: autosave/recovery, missing-media relink and portable show export.
2. Shared GPU transition composition with measured fallback/quality/parity and
   per-Program timing. Existing GPU scaling is a separate implementation.
3. Authenticated remote operation with operator/viewer permissions and explicit
   network exposure controls. No control service starts in the current preview.
4. macOS/Linux build/dependency/graphics/output validation on those real platforms.
5. Scheduling and 24-hour operation after the events/show workflow is qualified.

These remain planned until implementation and evidence say otherwise. Allocation
guards are not a rated number of simultaneous Programs, screens or network senders.
