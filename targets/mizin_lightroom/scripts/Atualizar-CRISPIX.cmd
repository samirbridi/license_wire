@echo off
title Atualizar CRISPIX (Lightroom Classic)
echo ========================================================
echo   CRISPIX - Atualizador Automatico
echo ========================================================
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Update-CrispixPlugin.ps1" -InstallDirectory "%~dp0."
echo.
pause
