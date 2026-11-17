"""Offline Windows installer integration: disposable plugins, no real LR or network."""
import base64
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest
import zipfile

SCRIPTS = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('launcher', SCRIPTS / 'Launch-CrispixUpdate.py')
launcher = importlib.util.module_from_spec(spec)
spec.loader.exec_module(launcher)


class UpdaterTests(unittest.TestCase):
    def test_launcher_copies_script_outside_plugin_and_encodes_special_paths(self):
        with tempfile.TemporaryDirectory() as temp:
            plugin = Path(temp) / "Fotos & Cris d'Ávila.lrplugin"
            plugin.mkdir()
            (plugin / 'BuildInfo.json').write_text('{}')
            (plugin / 'Update-CrispixPlugin.ps1').write_text('# fixture')
            work = Path(temp) / 'worker'
            source = base64.b64decode(launcher.prepare(plugin, work)).decode('utf-16le')
            self.assertIn(launcher.ps_literal(plugin.resolve()), source)
            self.assertIn('-NonInteractive -Reopen', source)
            self.assertIn('finally', source)
            self.assertNotIn('-PrestagedArchive', source)
            self.assertEqual((work / 'Update-CrispixPlugin.ps1').read_text(), '# fixture')

    def test_launcher_passes_prestaged_archive_metadata_when_given(self):
        with tempfile.TemporaryDirectory() as temp:
            plugin = Path(temp) / 'CRISPIX.lrplugin'
            plugin.mkdir()
            (plugin / 'BuildInfo.json').write_text('{}')
            (plugin / 'Update-CrispixPlugin.ps1').write_text('# fixture')
            staged = Path(temp) / 'staged.zip'
            staged.write_bytes(b'fake zip')
            work = Path(temp) / 'worker'
            source = base64.b64decode(launcher.prepare(
                plugin, work, prestaged_archive=staged, prestaged_version='v1.0.0 (build 0005)',
                prestaged_build=5, prestaged_sha256='a' * 64)).decode('utf-16le')
            self.assertIn('-PrestagedArchive', source)
            self.assertIn(launcher.ps_literal(staged.resolve()), source)
            self.assertIn(launcher.ps_literal('v1.0.0 (build 0005)'), source)
            self.assertIn('-PrestagedBuild 5', source)
            self.assertIn(launcher.ps_literal('a' * 64), source)

    class FakeProcess:
        def __init__(self, marker=None, exit_code=None):
            self.pid, self.marker, self.returncode = 4242, marker, exit_code

        def poll(self):
            if self.marker:
                Path(self.marker).write_text('started')
            return self.returncode

    def fake_popen(self, calls, process, refuse_breakaway=False):
        def popen(argv, **kwargs):
            calls.append(kwargs['creationflags'])
            if refuse_breakaway and kwargs['creationflags'] & launcher.CREATE_BREAKAWAY_FROM_JOB:
                raise PermissionError(5, 'Access is denied')
            return process
        return popen

    @unittest.skipUnless(os.name == 'nt', 'Windows process flags')
    def test_launcher_uses_a_hidden_console_never_a_detached_process(self):
        # Regression (build 0040): DETACHED_PROCESS made powershell.exe exit 0 without running.
        with tempfile.TemporaryDirectory() as temp:
            marker, calls = Path(temp) / 'update.log', []
            pid = launcher.start('AA==', temp, marker, popen=self.fake_popen(calls, self.FakeProcess(marker)),
                                 pause=lambda _: None)
            self.assertEqual(pid, 4242)
            self.assertFalse(calls[0] & subprocess.DETACHED_PROCESS)
            self.assertTrue(calls[0] & subprocess.CREATE_NO_WINDOW)
            self.assertTrue(calls[0] & launcher.CREATE_BREAKAWAY_FROM_JOB)

    @unittest.skipUnless(os.name == 'nt', 'Windows process flags')
    def test_launcher_retries_inside_the_job_when_breakaway_is_refused(self):
        with tempfile.TemporaryDirectory() as temp:
            marker, calls = Path(temp) / 'update.log', []
            launcher.start('AA==', temp, marker, popen=self.fake_popen(calls, self.FakeProcess(marker), True),
                           pause=lambda _: None)
            self.assertEqual(len(calls), 2)
            self.assertFalse(calls[1] & launcher.CREATE_BREAKAWAY_FROM_JOB)
            self.assertTrue(calls[1] & subprocess.CREATE_NO_WINDOW)

    @unittest.skipUnless(os.name == 'nt', 'Windows process flags')
    def test_launcher_fails_loudly_when_powershell_ends_without_starting(self):
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaisesRegex(RuntimeError, 'sem iniciar'):
                launcher.start('AA==', temp, Path(temp) / 'update.log',
                               popen=self.fake_popen([], self.FakeProcess(exit_code=0)), pause=lambda _: None)

    @unittest.skipUnless(os.name == 'nt', 'Windows PowerShell integration')
    def test_launcher_really_runs_the_encoded_powershell_command(self):
        # Real powershell.exe: the encoded command must execute, not just start and vanish.
        with tempfile.TemporaryDirectory() as temp:
            marker = Path(temp) / 'update.log'
            source = f"Set-Content -LiteralPath {launcher.ps_literal(marker)} -Value 'started'"
            encoded = base64.b64encode(source.encode('utf-16le')).decode('ascii')
            launcher.start(encoded, temp, marker, timeout=60)
            self.assertEqual(marker.read_text(encoding='utf-8-sig').strip(), 'started')

    @unittest.skipUnless(os.name == 'nt', 'Windows PowerShell integration')
    def test_installer_success_hash_failure_version_mismatch_and_rollback(self):
        for mode in ('success', 'internet', 'hash', 'version', 'move'):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as temp:
                root = Path(temp)
                plugin = root / "Cris & Ávila.lrplugin"
                plugin.mkdir()
                old = {'version': 'v0.0.1 (build 0001)'}
                (plugin / 'BuildInfo.json').write_text(json.dumps(old))
                (plugin / 'old.txt').write_text('preserve me')
                channel = root / 'channel'
                channel.mkdir()
                archive = channel / 'fixture.zip'
                version = 'v0.1.0 (build 0002)'
                with zipfile.ZipFile(archive, 'w') as z:
                    z.writestr('CRISPIX.lrplugin/BuildInfo.json', json.dumps({'version': version if mode != 'version' else 'wrong'}))
                    z.writestr('CRISPIX.lrplugin/Info.lua', 'return {}')
                    z.writestr('CRISPIX.lrplugin/new.txt', 'installed')
                digest = hashlib.sha256(archive.read_bytes()).hexdigest()
                (channel / 'latest.json').write_text(json.dumps({
                    'version': version, 'build': 2, 'archiveName': archive.name,
                    'archiveSha256': digest if mode != 'hash' else '0' * 64,
                    'deliveryFolder': 'fixture',
                    'downloadUrl': 'https://example.invalid/fixture.zip',
                }))
                (channel / 'latest.json').write_bytes(b'\xef\xbb\xbf' + (channel / 'latest.json').read_bytes())
                wrapper = root / 'test.ps1'
                # Explicit mocks: these tests cannot contact internet, close or launch LR.
                text = rf"""$ErrorActionPreference='Stop'
$global:fixtureInternet={'$true' if mode == 'internet' else '$false'}
function Invoke-WebRequest {{
    param($Uri,$OutFile,$TimeoutSec,[switch]$UseBasicParsing)
    if (-not $global:fixtureInternet) {{ throw 'offline fixture' }}
    if ($OutFile) {{ Copy-Item -LiteralPath {launcher.ps_literal(archive)} -Destination $OutFile;return }}
    return [PSCustomObject]@{{ RawContentStream=[IO.MemoryStream]::new([IO.File]::ReadAllBytes({launcher.ps_literal(channel / 'latest.json')})) }}
}}
function Get-Process {{ return @() }}
function Start-Process {{ throw 'Unexpected application launch' }}
$global:installTarget=[IO.Path]::GetFullPath({launcher.ps_literal(plugin)})
$global:failMove={'$true' if mode == 'move' else '$false'}
function Move-Item {{
    param($LiteralPath,$Destination,[switch]$Force)
    if ($global:failMove -and $Destination -eq $global:installTarget -and $LiteralPath -like '*crispix-update-*') {{
        $global:failMove=$false
        throw 'simulated install failure'
    }}
    Microsoft.PowerShell.Management\Move-Item -LiteralPath $LiteralPath -Destination $Destination -Force:$Force
}}
& {launcher.ps_literal(SCRIPTS / 'Update-CrispixPlugin.ps1')} -ChannelPath {launcher.ps_literal(channel)} -InstallDirectory {launcher.ps_literal(plugin)} -NonInteractive
"""
                wrapper.write_text(text, encoding='utf-8-sig')
                ps = Path(os.environ['SystemRoot']) / 'System32/WindowsPowerShell/v1.0/powershell.exe'
                env = {k: v for k, v in os.environ.items() if k.lower() != 'psmodulepath'}
                run = subprocess.run([str(ps), '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(wrapper)],
                                     capture_output=True, text=True, errors='replace', timeout=30, env=env)
                if mode in ('success', 'internet'):
                    self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
                    self.assertTrue((plugin / 'new.txt').exists())
                    backups = list(root.glob('*.bak-*'))
                    self.assertEqual(len(backups), 1)
                    self.assertEqual((backups[0] / 'old.txt').read_text(), 'preserve me')
                else:
                    self.assertNotEqual(run.returncode, 0, run.stdout + run.stderr)
                    self.assertEqual((plugin / 'old.txt').read_text(), 'preserve me')
                    self.assertEqual(json.loads((plugin / 'BuildInfo.json').read_text()), old)
                    if mode == 'move':
                        self.assertIn('Backup restaurado', run.stdout)

    @unittest.skipUnless(os.name == 'nt', 'Windows PowerShell integration')
    def test_prestaged_archive_skips_manifest_and_installs_real_powershell(self):
        # Mirrors the handoff CheckUpdates.lua performs after the in-Lightroom progress
        # dialog finishes staging: no manifest query, no download -- just the already
        # SHA-256-validated archive, re-validated here, swapped in with backup as usual.
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            plugin = root / "Cris & Ávila.lrplugin"
            plugin.mkdir()
            old = {'version': 'v0.0.1 (build 0001)'}
            (plugin / 'BuildInfo.json').write_text(json.dumps(old))
            (plugin / 'old.txt').write_text('preserve me')

            staged_archive = root / 'staged.zip'
            version = 'v0.1.0 (build 0002)'
            with zipfile.ZipFile(staged_archive, 'w') as z:
                z.writestr('CRISPIX.lrplugin/BuildInfo.json', json.dumps({'version': version}))
                z.writestr('CRISPIX.lrplugin/Info.lua', 'return {}')
                z.writestr('CRISPIX.lrplugin/new.txt', 'installed')
            digest = hashlib.sha256(staged_archive.read_bytes()).hexdigest()

            wrapper = root / 'test.ps1'
            text = rf"""$ErrorActionPreference='Stop'
function Invoke-WebRequest {{ throw 'Must not contact the network when prestaged' }}
function Get-Process {{ return @() }}
function Start-Process {{ throw 'Unexpected application launch' }}
& {launcher.ps_literal(SCRIPTS / 'Update-CrispixPlugin.ps1')} -InstallDirectory {launcher.ps_literal(plugin)} -NonInteractive `
    -PrestagedArchive {launcher.ps_literal(staged_archive)} -PrestagedVersion {launcher.ps_literal(version)} `
    -PrestagedBuild 2 -PrestagedSha256 {launcher.ps_literal(digest)}
"""
            wrapper.write_text(text, encoding='utf-8-sig')
            ps = Path(os.environ['SystemRoot']) / 'System32/WindowsPowerShell/v1.0/powershell.exe'
            env = {k: v for k, v in os.environ.items() if k.lower() != 'psmodulepath'}
            run = subprocess.run([str(ps), '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(wrapper)],
                                 capture_output=True, text=True, errors='replace', timeout=30, env=env)
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
            self.assertTrue((plugin / 'new.txt').exists())
            backups = list(root.glob('*.bak-*'))
            self.assertEqual(len(backups), 1)
            self.assertEqual((backups[0] / 'old.txt').read_text(), 'preserve me')

    @unittest.skipUnless(os.name == 'nt', 'Windows PowerShell integration')
    def test_prestaged_archive_with_wrong_hash_is_rejected_real_powershell(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            plugin = root / "Cris.lrplugin"
            plugin.mkdir()
            old = {'version': 'v0.0.1 (build 0001)'}
            (plugin / 'BuildInfo.json').write_text(json.dumps(old))
            (plugin / 'old.txt').write_text('preserve me')

            staged_archive = root / 'staged.zip'
            with zipfile.ZipFile(staged_archive, 'w') as z:
                z.writestr('CRISPIX.lrplugin/BuildInfo.json', json.dumps({'version': 'v0.1.0 (build 0002)'}))
                z.writestr('CRISPIX.lrplugin/Info.lua', 'return {}')

            wrapper = root / 'test.ps1'
            text = rf"""$ErrorActionPreference='Stop'
function Get-Process {{ return @() }}
& {launcher.ps_literal(SCRIPTS / 'Update-CrispixPlugin.ps1')} -InstallDirectory {launcher.ps_literal(plugin)} -NonInteractive `
    -PrestagedArchive {launcher.ps_literal(staged_archive)} -PrestagedVersion 'v0.1.0 (build 0002)' `
    -PrestagedBuild 2 -PrestagedSha256 {'0' * 64}
"""
            wrapper.write_text(text, encoding='utf-8-sig')
            ps = Path(os.environ['SystemRoot']) / 'System32/WindowsPowerShell/v1.0/powershell.exe'
            env = {k: v for k, v in os.environ.items() if k.lower() != 'psmodulepath'}
            run = subprocess.run([str(ps), '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(wrapper)],
                                 capture_output=True, text=True, errors='replace', timeout=30, env=env)
            self.assertNotEqual(run.returncode, 0, run.stdout + run.stderr)
            self.assertEqual((plugin / 'old.txt').read_text(), 'preserve me')
            self.assertEqual(json.loads((plugin / 'BuildInfo.json').read_text()), old)

    def test_launcher_in_place_mode_reports_progress_and_never_reopens_or_pops_messagebox(self):
        with tempfile.TemporaryDirectory() as temp:
            plugin = Path(temp) / 'CRISPIX.lrplugin'
            plugin.mkdir()
            (plugin / 'BuildInfo.json').write_text('{}')
            (plugin / 'Update-CrispixPlugin.ps1').write_text('# fixture')
            progress = Path(temp) / 'install progress.json'
            source = base64.b64decode(launcher.prepare(
                plugin, Path(temp) / 'w', Path(temp) / 'staged.zip', 'v0.1.0 (build 0002)', 2, 'a' * 64,
                in_place=True, progress_file=progress)).decode('utf-16le')
            self.assertIn(f'-NonInteractive -InPlace -ProgressFile {launcher.ps_literal(progress.resolve())}', source)
            self.assertNotIn('-Reopen', source)
            self.assertNotIn('MessageBox', source)
            self.assertIn("stage='error'", source)
            with self.assertRaises(ValueError):
                launcher.prepare(plugin, Path(temp) / 'w2', in_place=True)

    @unittest.skipUnless(os.name == 'nt', 'Windows PowerShell integration')
    def test_restart_helper_is_valid_powershell_and_never_forces(self):
        self.assertNotIn('Stop-Process', launcher.RESTART_SOURCE)
        self.assertIn('AgWinMainFrame', launcher.RESTART_SOURCE)
        with tempfile.TemporaryDirectory() as temp:
            script = Path(temp) / 'restart.ps1'
            script.write_text(launcher.RESTART_SOURCE.replace('__MARKER__', "'x'"), encoding='utf-8-sig')
            check = (f"$e=$null;[void][System.Management.Automation.Language.Parser]::ParseFile("
                     f"{launcher.ps_literal(script)},[ref]$null,[ref]$e);if($e){{$e;exit 1}}")
            ps = Path(os.environ['SystemRoot']) / 'System32/WindowsPowerShell/v1.0/powershell.exe'
            run = subprocess.run([str(ps), '-NoProfile', '-Command', check], capture_output=True, text=True, timeout=60)
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)

    def _in_place_fixture(self, root):
        plugin = root / "Cris & Ávila.lrplugin"
        (plugin / 'Runtime').mkdir(parents=True)
        (plugin / 'BuildInfo.json').write_text(json.dumps({'version': 'v0.0.1 (build 0001)'}))
        (plugin / 'Runtime' / 'python313.dll').write_bytes(b'same runtime')
        (plugin / 'Engine.lua').write_text('old engine')
        (plugin / 'obsolete.lua').write_text('remove me')
        archive = root / 'staged.zip'
        version = 'v0.1.0 (build 0002)'
        with zipfile.ZipFile(archive, 'w') as z:
            z.writestr('CRISPIX.lrplugin/BuildInfo.json', json.dumps({'version': version}))
            z.writestr('CRISPIX.lrplugin/Info.lua', 'return {}')
            z.writestr('CRISPIX.lrplugin/Runtime/python313.dll', b'same runtime')
            z.writestr('CRISPIX.lrplugin/Engine.lua', 'new engine')
            z.writestr('CRISPIX.lrplugin/Branding/new.png', b'png')
        digest = hashlib.sha256(archive.read_bytes()).hexdigest()
        progress = root / 'progress.json'
        wrapper = root / 'test.ps1'
        # Lightroom "is running": closing it would be a failure of this mode.
        wrapper.write_text(rf"""$ErrorActionPreference='Stop'
function Invoke-WebRequest {{ throw 'Must not contact the network when prestaged' }}
function Get-Process {{
    $p=[PSCustomObject]@{{ Path='C:\fake\Lightroom.exe'; Id=4242 }}
    $p | Add-Member -MemberType ScriptMethod -Name CloseMainWindow -Value {{ throw 'Lightroom must stay open' }}
    return $p
}}
function Wait-Process {{ throw 'Must not wait for Lightroom' }}
function Start-Process {{ throw 'Unexpected application launch' }}
& {launcher.ps_literal(SCRIPTS / 'Update-CrispixPlugin.ps1')} -InstallDirectory {launcher.ps_literal(plugin)} -NonInteractive -InPlace `
    -ProgressFile {launcher.ps_literal(progress)} -PrestagedArchive {launcher.ps_literal(archive)} `
    -PrestagedVersion {launcher.ps_literal(version)} -PrestagedBuild 2 -PrestagedSha256 {launcher.ps_literal(digest)}
""", encoding='utf-8-sig')
        return plugin, progress, wrapper

    def _run_ps(self, wrapper, timeout=90):
        ps = Path(os.environ['SystemRoot']) / 'System32/WindowsPowerShell/v1.0/powershell.exe'
        env = {k: v for k, v in os.environ.items() if k.lower() != 'psmodulepath'}
        return subprocess.run([str(ps), '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', str(wrapper)],
                              capture_output=True, text=True, errors='replace', timeout=timeout, env=env)

    @unittest.skipUnless(os.name == 'nt', 'Windows PowerShell integration')
    def test_in_place_install_keeps_lightroom_open_and_swaps_only_changed_files(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            plugin, progress, wrapper = self._in_place_fixture(root)
            run = self._run_ps(wrapper)
            self.assertEqual(run.returncode, 0, run.stdout + run.stderr)
            self.assertEqual((plugin / 'Engine.lua').read_text(), 'new engine')
            self.assertEqual((plugin / 'Branding' / 'new.png').read_bytes(), b'png')
            self.assertFalse((plugin / 'obsolete.lua').exists())
            self.assertEqual(json.loads((plugin / 'BuildInfo.json').read_text())['version'], 'v0.1.0 (build 0002)')
            self.assertEqual(json.loads(progress.read_text(encoding='utf-8'))['stage'], 'done')
            backups = list(root.glob('*.bak-*'))
            self.assertEqual(len(backups), 1)
            self.assertEqual((backups[0] / 'Engine.lua').read_text(), 'old engine')
            self.assertEqual((backups[0] / 'obsolete.lua').read_text(), 'remove me')
            # Identical files (the big Runtime) are never touched or backed up.
            self.assertFalse((backups[0] / 'Runtime').exists())

    @unittest.skipUnless(os.name == 'nt', 'Windows PowerShell integration')
    def test_in_place_install_rolls_back_everything_when_a_file_is_locked(self):
        import msvcrt
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            plugin, progress, wrapper = self._in_place_fixture(root)
            (plugin / 'Runtime' / 'python313.dll').write_bytes(b'old runtime in use')
            # Exclusive lock, like a loaded DLL: replacing it must fail and undo the rest.
            handle = open(plugin / 'Runtime' / 'python313.dll', 'r+b')
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            try:
                run = self._run_ps(wrapper, timeout=120)
            finally:
                msvcrt.locking(handle.fileno(), msvcrt.LK_UNLCK, 1)
                handle.close()
            self.assertNotEqual(run.returncode, 0, run.stdout + run.stderr)
            self.assertEqual((plugin / 'Runtime' / 'python313.dll').read_bytes(), b'old runtime in use')
            self.assertEqual((plugin / 'Engine.lua').read_text(), 'old engine')
            self.assertEqual((plugin / 'obsolete.lua').read_text(), 'remove me')
            self.assertFalse((plugin / 'Branding' / 'new.png').exists())
            self.assertEqual(json.loads((plugin / 'BuildInfo.json').read_text())['version'], 'v0.0.1 (build 0001)')
            state = json.loads(progress.read_text(encoding='utf-8'))
            self.assertEqual(state['stage'], 'error')

    def test_cmd_policy_is_scoped_to_process_and_uses_own_installation(self):
        cmd = (SCRIPTS / 'Atualizar-CRISPIX.cmd').read_text()
        self.assertIn('-ExecutionPolicy Bypass', cmd)
        self.assertIn('-InstallDirectory "%~dp0."', cmd)
        self.assertNotIn('Set-ExecutionPolicy', cmd)
