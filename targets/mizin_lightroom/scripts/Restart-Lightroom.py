"""Clean restart of Lightroom Classic after an update."""
from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
import time


def restart_lightroom():
    # Wait for the modal dialog in Lightroom to dismiss
    time.sleep(1.5)

    # Try finding the running Lightroom.exe path via WMIC / PowerShell or default locations
    lr_exe = None
    try:
        cmd = ["powershell", "-NoProfile", "-Command",
               "(Get-Process -Name Lightroom -ErrorAction SilentlyContinue | Select-Object -First 1).Path"]
        out = subprocess.check_output(cmd, text=True, stderr=subprocess.DEVNULL).strip()
        if out and Path(out).is_file():
            lr_exe = out
    except Exception:
        pass

    if not lr_exe:
        default_path = Path("C:/Program Files/Adobe/Adobe Lightroom Classic/Lightroom.exe")
        if default_path.is_file():
            lr_exe = str(default_path)

    # Request clean close (WM_CLOSE equivalent via taskkill without /F)
    try:
        subprocess.run(["taskkill", "/IM", "Lightroom.exe"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass

    # Wait for Lightroom to close cleanly (up to 30 seconds for catalog save/backup)
    for _ in range(60):
        time.sleep(0.5)
        try:
            check = subprocess.run(["tasklist", "/FI", "IMAGENAME eq Lightroom.exe"],
                                   capture_output=True, text=True)
            if "Lightroom.exe" not in check.stdout:
                break
        except Exception:
            break

    # Relaunch Lightroom if found
    if lr_exe and Path(lr_exe).is_file():
        subprocess.Popen([lr_exe], close_fds=True)


if __name__ == "__main__":
    restart_lightroom()
