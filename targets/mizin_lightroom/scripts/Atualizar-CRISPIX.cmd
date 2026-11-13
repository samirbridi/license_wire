@echo off
title Atualizar CRISPIX (Lightroom Classic)
echo ========================================================
echo   CRISPIX - Atualizador Automatico
echo ========================================================
echo.
powershell.exe -NoProfile -File "%~dp0Update-CrispixPlugin.ps1"
echo.
pause
