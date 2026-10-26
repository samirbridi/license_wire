@echo off
setlocal
rem Executado pelo proprietario no Windows: gera novo acesso e abre seu navegador.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-central.ps1" -Restart -OpenBrowser
if errorlevel 1 pause
endlocal
