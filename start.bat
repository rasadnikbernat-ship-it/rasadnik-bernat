@echo off
REM Rasadnik Bernat - pokreni editor jednim klikom (Windows).
REM Dvoklik na ovu datoteku.

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nije instaliran. Instaliraj ga s https://nodejs.org ^(LTS verzija^), pa pokreni ponovno.
  pause
  exit /b 1
)

node generator\editor\server.js
pause
