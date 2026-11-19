@echo off
rem Double-click or run from cmd: builds and pushes all Loadstone images (see push-images.ps1 for options).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0push-images.ps1" %*
if errorlevel 1 (
  echo.
  echo Push failed.
  pause
  exit /b 1
)
