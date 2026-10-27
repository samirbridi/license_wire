Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "powershell.exe -NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File ""d:\REA - ENGENHARIA REVERSA\targets\tuya_smartlife\scripts\mizin-guardian.ps1""", 0, False
