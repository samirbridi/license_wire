@echo off
chcp 65001 >nul
echo ============================================================
echo   MIZIN HOME - SINCRONIZADOR GWM ORA 5 (My GWM Brasil)
echo ============================================================
node "%~dp0reconstructed\gwm-ora-client.mjs" sync
echo.
echo Snapshot salvo em: %~dp0runtime\ora5_telemetry_latest.json
pause

