@echo off
title BCS Written Interactive Tree-Notebook
cd /d "%~dp0"

echo.
echo   ================================================
echo    BCS Written Interactive Tree-Notebook
echo    Starting your local server... please wait
echo    (Lokal server chalu hocche - ektu opekha korun)
echo   ================================================
echo.
echo   Tip: purano kono BCS server window khola thakle
echo   bondho kore din - launcher nije-i check kore
echo   purano instance thakle seta bondho kore dey.
echo.

rem ---- Make sure we are running from an EXTRACTED folder ----
if not exist "%~dp0launcher.mjs" (
  echo  [!] launcher.mjs was not found next to START.bat.
  echo.
  echo      Probable reason: apni ZIP file er bhitore thekei
  echo      START.bat double-click korechen.
  echo.
  echo      Fix: ZIP file ti right-click kore "Extract All..."
  echo      diye ekta folder-e extract korun. Tarpor oi extracted
  echo      folder-er bhitore giye START.bat e double-click korun.
  echo.
  pause
  exit /b 1
)

set "NODE_EXE="

rem ---- 1) Look in standard Node.js install folders ----
rem     (works even if Windows PATH has not been refreshed after installing)
for %%P in ("%ProgramFiles%\nodejs\node.exe" "%ProgramFiles(x86)%\nodejs\node.exe" "%LocalAppData%\Programs\nodejs\node.exe") do (
  if exist "%%~P" if not defined NODE_EXE set "NODE_EXE=%%~P"
)

rem ---- 2) Fall back to PATH lookup ----
if not defined NODE_EXE (
  where node >nul 2>nul
  if not errorlevel 1 set "NODE_EXE=node"
)

rem ---- 3) Still not found -> guide the user to install Node.js ----
if not defined NODE_EXE (
  echo  [!] Node.js could not be found on this laptop.
  echo      Node.js khujte paoa jacche na.
  echo.
  echo      Opening https://nodejs.org in your browser now...
  echo      1. Click the green "LTS" button and install Node.js
  echo      2. Restart your PC once after install
  echo      3. Double-click START.bat again
  echo.
  start "" https://nodejs.org
  pause
  exit /b 1
)

rem ---- Add node's folder to PATH so npm/next are reachable too ----
if not "%NODE_EXE%"=="node" (
  for %%D in ("%NODE_EXE%") do set "PATH=%%~dpD;%PATH%"
)

echo   Node found: %NODE_EXE%
echo.

"%NODE_EXE%" launcher.mjs
echo.
pause
