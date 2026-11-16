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


def prepare(plugin, work):
    plugin, work = Path(plugin).resolve(), Path(work).resolve()
    if plugin.suffix.lower() != '.lrplugin' or not (plugin / 'BuildInfo.json').is_file():
        raise ValueError('Instalacao do plugin invalida')
    work.mkdir(parents=True, exist_ok=True)
    script = work / 'Update-CrispixPlugin.ps1'
    shutil.copy2(plugin / script.name, script)
    # Copy is outside the plugin: replacing that folder cannot remove our running script.
    log = work / 'update.log'
    source = f"""$ErrorActionPreference='Stop'
$code=1
try {{
    Start-Transcript -LiteralPath {ps_literal(log)} -Force | Out-Null
    & {ps_literal(script)} -InstallDirectory {ps_literal(plugin)} -NonInteractive -Reopen
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


def launch(plugin):
    work = Path(tempfile.mkdtemp(prefix='crispix-updater-'))
    encoded = prepare(plugin, work)
    return start(encoded, work, work / 'update.log')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--plugin', required=True, type=Path)
    args = parser.parse_args()
    try:
        launch(args.plugin)
    except Exception as error:  # pythonw has no console: the exit code is what Lightroom sees
        sys.exit(f'CRISPIX: {error}')
