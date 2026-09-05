@echo off
setlocal
echo Starting Salvage with PowerShell...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start.ps1" %*
