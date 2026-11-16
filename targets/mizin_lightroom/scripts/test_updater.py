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
            self.assertEqual((work / 'Update-CrispixPlugin.ps1').read_text(), '# fixture')

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

    def test_cmd_policy_is_scoped_to_process_and_uses_own_installation(self):
        cmd = (SCRIPTS / 'Atualizar-CRISPIX.cmd').read_text()
        self.assertIn('-ExecutionPolicy Bypass', cmd)
        self.assertIn('-InstallDirectory "%~dp0."', cmd)
        self.assertNotIn('Set-ExecutionPolicy', cmd)
