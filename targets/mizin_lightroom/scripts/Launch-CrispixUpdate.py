"""Detach the updater from Lightroom using only the bundled Python standard library."""
import argparse
import base64
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time


def ps_literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def prepare(plugin, work, prestaged_archive=None, prestaged_version=None, prestaged_build=None, prestaged_sha256=None,
            in_place=False, progress_file=None):
    plugin, work = Path(plugin).resolve(), Path(work).resolve()
    if plugin.suffix.lower() != '.lrplugin' or not (plugin / 'BuildInfo.json').is_file():
        raise ValueError('Instalacao do plugin invalida')
    work.mkdir(parents=True, exist_ok=True)
    script = work / 'Update-CrispixPlugin.ps1'
    shutil.copy2(plugin / script.name, script)
    # Copy is outside the plugin: replacing that folder cannot remove our running script.
    log = work / 'update.log'
    extra_args = ''
    if prestaged_archive:
        # The staged archive lives in %TEMP%\crispix-stage-<build>\, created by the
        # in-Lightroom progress dialog (InApp-UpdatePlugin.py); it is outside the plugin
        # directory, so copying/reading it here never conflicts with Runtime/ in use.
        extra_args = (f' -PrestagedArchive {ps_literal(Path(prestaged_archive).resolve())}'
                      f' -PrestagedVersion {ps_literal(prestaged_version)}'
                      f' -PrestagedBuild {int(prestaged_build)}'
                      f' -PrestagedSha256 {ps_literal(prestaged_sha256)}')
    if in_place:
        # Lightroom stays open and shows progress/result itself (CheckUpdates.lua reads
        # progress_file), so no -Reopen and no MessageBox hidden behind Lightroom.
        if not progress_file:
            raise ValueError('Instalacao com o Lightroom aberto exige arquivo de progresso')
        progress = Path(progress_file).resolve()
        source = f"""$ErrorActionPreference='Stop'
try {{
    Start-Transcript -LiteralPath {ps_literal(log)} -Force | Out-Null
    & {ps_literal(script)} -InstallDirectory {ps_literal(plugin)} -NonInteractive -InPlace -ProgressFile {ps_literal(progress)}{extra_args}
}} catch {{
    Write-Output $_
    $text=(@{{stage='error';percent=0;message=('Falha na instalacao: ' + $_.Exception.Message + ' Registro: ' + {ps_literal(log)})}} | ConvertTo-Json -Compress)
    try {{ [IO.File]::WriteAllText({ps_literal(progress)}, $text, (New-Object Text.UTF8Encoding($false))) }} catch {{}}
}} finally {{
    try {{ Stop-Transcript | Out-Null }} catch {{}}
}}
"""
    else:
        source = f"""$ErrorActionPreference='Stop'
$code=1
try {{
    Start-Transcript -LiteralPath {ps_literal(log)} -Force | Out-Null
    & {ps_literal(script)} -InstallDirectory {ps_literal(plugin)} -NonInteractive -Reopen{extra_args}
    $code=0
}} catch {{ Write-Output $_ }} finally {{
    try {{ Stop-Transcript | Out-Null }} catch {{}}
    Add-Type -AssemblyName System.Windows.Forms
    $message=if ($code -eq 0) {{ 'Atualizacao concluida. O Lightroom sera reaberto.' }} else {{ 'Nao foi possivel atualizar. Consulte o registro:' }}
    [System.Windows.Forms.MessageBox]::Show(($message + [Environment]::NewLine + {ps_literal(log)}), 'CRISPIX - atualizacao') | Out-Null
}}
"""
    encoded = base64.b64encode(source.encode('utf-16le')).decode('ascii')
    return encoded


CREATE_BREAKAWAY_FROM_JOB = 0x01000000
# DETACHED_PROCESS (no console at all) made powershell.exe exit 0 without running a single line
# of -EncodedCommand: "Atualizar agora" did nothing and reported no error (measured 2026-11-16,
# build 0040). A hidden console (CREATE_NO_WINDOW) runs the installer.
HIDDEN_CONSOLE = subprocess.CREATE_NO_WINDOW | subprocess.CREATE_NEW_PROCESS_GROUP


def start(encoded, work, started_marker, timeout=25.0, popen=subprocess.Popen, clock=time.monotonic, pause=time.sleep):
    """Start hidden PowerShell and wait until it proves it is running (the transcript exists).

    Raises when PowerShell ends without starting, so Lightroom shows the fallback instructions
    instead of silently doing nothing."""
    powershell = Path(os.environ['SystemRoot']) / 'System32/WindowsPowerShell/v1.0/powershell.exe'
    startup = subprocess.STARTUPINFO()
    startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startup.wShowWindow = subprocess.SW_HIDE
    env = {key: value for key, value in os.environ.items() if key.lower() != 'psmodulepath'}
    argv = [str(powershell), '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded]
    process = None
    # Leave Lightroom's job (if any) so closing Lightroom cannot end the installer; fall back when
    # the job forbids breakaway (CreateProcess then fails with access denied).
    for flags in (HIDDEN_CONSOLE | CREATE_BREAKAWAY_FROM_JOB, HIDDEN_CONSOLE):
        try:
            process = popen(argv, cwd=str(work), stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                            stderr=subprocess.DEVNULL, startupinfo=startup, creationflags=flags,
                            close_fds=True, env=env)
            break
        except OSError:
            if flags == HIDDEN_CONSOLE:
                raise
    deadline = clock() + timeout
    while clock() < deadline:
        if Path(started_marker).exists():
            return process.pid
        if process.poll() is not None:
            raise RuntimeError(f'O atualizador terminou sem iniciar (codigo {process.returncode}).')
        pause(0.2)
    if Path(started_marker).exists():
        return process.pid
    raise RuntimeError('O atualizador nao confirmou o inicio a tempo.')


def launch(plugin, prestaged_archive=None, prestaged_version=None, prestaged_build=None, prestaged_sha256=None,
           in_place=False, progress_file=None):
    work = Path(tempfile.mkdtemp(prefix='crispix-updater-'))
    encoded = prepare(plugin, work, prestaged_archive, prestaged_version, prestaged_build, prestaged_sha256,
                      in_place, progress_file)
    return start(encoded, work, work / 'update.log')


# Lightroom Classic's main frame on Windows is class AgWinMainFrame. Process.CloseMainWindow()
# picked whatever .NET considered the "main" window and Lightroom kept running (reported by the
# user on builds 0043/0044: "nada acontece" until Lightroom was closed by hand). WM_CLOSE goes to
# the real frame; Lightroom then runs its normal exit (catalog backup prompt included). Never
# forced: if Lightroom is still open after the wait, nothing else happens.
RESTART_SOURCE = r"""$ErrorActionPreference='Stop'
Set-Content -LiteralPath __MARKER__ -Value 'started'
Start-Sleep -Seconds 2
$lr = Get-Process -Name 'Lightroom' -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $lr) { exit 0 }
$exe = $lr.Path
Add-Type -Namespace Crispix -Name Win -MemberDefinition @'
public delegate bool EnumProc(System.IntPtr h, System.IntPtr p);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, System.IntPtr p);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr h, out uint pid);
[System.Runtime.InteropServices.DllImport("user32.dll", CharSet=System.Runtime.InteropServices.CharSet.Unicode)] public static extern int GetClassName(System.IntPtr h, System.Text.StringBuilder s, int n);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool IsWindowVisible(System.IntPtr h);
[System.Runtime.InteropServices.DllImport("user32.dll")] public static extern bool PostMessage(System.IntPtr h, uint m, System.IntPtr w, System.IntPtr l);
'@
$targets = New-Object System.Collections.Generic.List[System.IntPtr]
$callback = [Crispix.Win+EnumProc]{
    param($h, $p)
    $owner = [uint32]0
    [void][Crispix.Win]::GetWindowThreadProcessId($h, [ref]$owner)
    if ($owner -eq $lr.Id -and [Crispix.Win]::IsWindowVisible($h)) {
        $name = New-Object System.Text.StringBuilder 256
        [void][Crispix.Win]::GetClassName($h, $name, 256)
        if ($name.ToString() -eq 'AgWinMainFrame') { $targets.Add($h) }
    }
    return $true
}
[void][Crispix.Win]::EnumWindows($callback, [System.IntPtr]::Zero)
if ($targets.Count -eq 0 -and $lr.MainWindowHandle -ne [System.IntPtr]::Zero) { $targets.Add($lr.MainWindowHandle) }
foreach ($h in $targets) { [void][Crispix.Win]::PostMessage($h, 0x0010, [System.IntPtr]::Zero, [System.IntPtr]::Zero) }
# Catalog backup/optimization can take minutes; wait, but never force.
$lr | Wait-Process -Timeout 600 -ErrorAction SilentlyContinue
if (Get-Process -Id $lr.Id -ErrorAction SilentlyContinue) { exit 0 }
Start-Sleep -Seconds 2
if ($exe -and (Test-Path -LiteralPath $exe)) { Start-Process -FilePath $exe }
"""


def launch_restart():
    work = Path(tempfile.mkdtemp(prefix='crispix-restart-'))
    marker = work / 'started.txt'
    source = RESTART_SOURCE.replace('__MARKER__', ps_literal(marker))
    encoded = base64.b64encode(source.encode('utf-16le')).decode('ascii')
    return start(encoded, work, marker)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--plugin', required=False, type=Path)
    parser.add_argument('--prestaged-archive', required=False, type=Path, default=None)
    parser.add_argument('--prestaged-version', required=False, type=str, default=None)
    parser.add_argument('--prestaged-build', required=False, type=int, default=None)
    parser.add_argument('--prestaged-sha256', required=False, type=str, default=None)
    parser.add_argument('--in-place', action='store_true')
    parser.add_argument('--progress-file', required=False, type=Path, default=None)
    parser.add_argument('--restart-lightroom', action='store_true')
    args = parser.parse_args()
    try:
        if args.restart_lightroom:
            launch_restart()
        else:
            if args.plugin is None:
                raise ValueError('--plugin e obrigatorio')
            launch(args.plugin, args.prestaged_archive, args.prestaged_version, args.prestaged_build,
                   args.prestaged_sha256, args.in_place, args.progress_file)
    except Exception as error:  # pythonw has no console: the exit code is what Lightroom sees
        sys.exit(f'CRISPIX: {error}')
