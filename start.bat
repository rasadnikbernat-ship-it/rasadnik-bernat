@echo off
setlocal
REM Rasadnik Bernat - pokreni editor jednim klikom (Windows).
REM Dvoklik na ovu datoteku. Radi i kad projekt zivi u WSL-u (\\wsl.localhost\...).

REM Putanja ovog .bat-a (zavrsava s backslashom).
set "HERE=%~dp0"

REM --- Slucaj 1: projekt je u WSL-u (UNC putanja \\wsl...\ ili \\wsl$\...) ---
REM CMD ne podrzava UNC kao radni direktorij, pa izvodjenje delegiramo u WSL.
echo %HERE% | findstr /b /i "\\\\wsl" >nul
if %errorlevel%==0 goto run_in_wsl

REM --- Slucaj 2: obicna Windows putanja ---
cd /d "%HERE%"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js nije instaliran. Instaliraj ga s https://nodejs.org ^(LTS verzija^), pa pokreni ponovno.
  pause
  exit /b 1
)
node generator\editor\server.js
pause
exit /b 0

:run_in_wsl
echo Projekt je u WSL-u — pokrecem editor unutar Linuxa (WSL)...
where wsl >nul 2>nul
if errorlevel 1 (
  echo WSL nije dostupan. Otvori Ubuntu terminal i pokreni:  ./start.sh
  pause
  exit /b 1
)
REM Prevedi UNC putanju ove skripte u Linux putanju i pokreni start.sh ondje.
REM wslpath pretvara npr. \\wsl.localhost\Ubuntu-24.04\home\...  ->  /home/...
wsl.exe bash -lic "cd \"$(wslpath '%HERE%')\" && bash ./start.sh"
pause
exit /b 0
