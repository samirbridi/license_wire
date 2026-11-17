"""Detach the in-app update STAGING step so Lightroom's Lua thread can monitor progress
while Lightroom stays open. Staging only downloads, SHA-256-validates and extracts into
a temp folder outside the plugin (see InApp-UpdatePlugin.py for why: the plugin's own
Runtime/pythonw.exe is what is running, and Windows cannot replace a DLL loaded by the
process using it).

Once staging reports 'staged' in the progress file, CheckUpdates.lua hands off to
Update-CrispixPlugin.ps1 -PrestagedArchive (closes Lightroom, backs up, swaps files,
reopens) exactly as the existing one-click updater already does -- this script does not
perform that handoff itself, so a crash here can never leave the installed plugin half
old/half new.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import subprocess
import sys


def launch_in_app_stager(plugin: Path, download_url: str, sha256: str, version: str,
                         progress_file: Path, staging_dir: Path):
    runtime_python = plugin / "Runtime" / "pythonw.exe"
    python_exe = str(runtime_python) if runtime_python.is_file() else sys.executable

    stager_script = plugin / "InApp-UpdatePlugin.py"
    if not stager_script.is_file():
        stager_script = Path(__file__).resolve().parent / "InApp-UpdatePlugin.py"

    cmd = [
        python_exe,
        "-I",
        str(stager_script),
        "--download-url", download_url,
        "--sha256", sha256,
        "--progress-file", str(progress_file),
        "--staging-dir", str(staging_dir),
    ]
    if version:
        cmd.extend(["--version", version])

    # Start completely detached with no console window. Reading the plugin's own
    # pythonw.exe is safe (no write); nothing here touches the plugin directory.
    flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0
    subprocess.Popen(cmd, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                     close_fds=True, creationflags=flags)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--plugin", required=True, type=Path)
    parser.add_argument("--download-url", required=True, type=str)
    parser.add_argument("--sha256", required=True, type=str)
    parser.add_argument("--version", required=False, type=str)
    parser.add_argument("--progress-file", required=True, type=Path)
    parser.add_argument("--staging-dir", required=True, type=Path)
    args = parser.parse_args()

    launch_in_app_stager(args.plugin, args.download_url, args.sha256, args.version,
                         args.progress_file, args.staging_dir)


if __name__ == "__main__":
    main()
