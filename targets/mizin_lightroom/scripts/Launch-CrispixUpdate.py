"""Detach the updater from Lightroom using only the bundled Python standard library."""
import argparse
import base64
import os
from pathlib import Path
import shutil
import subprocess
import tempfile


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


def launch(plugin):
    work = Path(tempfile.mkdtemp(prefix='crispix-updater-'))
    encoded = prepare(plugin, work)
    powershell = Path(os.environ['SystemRoot']) / 'System32/WindowsPowerShell/v1.0/powershell.exe'
    startup = subprocess.STARTUPINFO()
    startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    startup.wShowWindow = subprocess.SW_HIDE
    env = {key: value for key, value in os.environ.items() if key.lower() != 'psmodulepath'}
    process = subprocess.Popen(
        [str(powershell), '-NoProfile', '-ExecutionPolicy', 'Bypass', '-WindowStyle', 'Hidden', '-EncodedCommand', encoded],
        cwd=str(work), stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        startupinfo=startup, creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP,
        close_fds=True, env=env)
    return process.pid


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--plugin', required=True, type=Path)
    args = parser.parse_args()
    launch(args.plugin)
