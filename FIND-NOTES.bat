@echo off
title BCS Notebook - Find old notes (custom.db)
cd /d "%~dp0"
echo.
echo   Searching for your old notes (custom.db) ...
echo   Purono notes Windows e aksathe C:\home\z\my-project\db\ e thakte pare.
echo.
echo   === Known locations ===
if exist "%~dp0db\custom.db" echo   FOUND  %~dp0db\custom.db
if exist "%~dp0prisma\db\custom.db" echo   FOUND  %~dp0prisma\db\custom.db
if exist "C:\home\z\my-project\db\custom.db" echo   FOUND  C:\home\z\my-project\db\custom.db
if exist "D:\home\z\my-project\db\custom.db" echo   FOUND  D:\home\z\my-project\db\custom.db
if exist "E:\home\z\my-project\db\custom.db" echo   FOUND  E:\home\z\my-project\db\custom.db
echo.
echo   === Searching this drive (may take 1-2 minutes) ===
dir /s /b "%~d0\home\z\my-project\db\custom.db" 2>nul
dir /s /b "%~d0\*\db\custom.db" 2>nul | more
echo.
echo   Jodi FOUND line dekhen: oi custom.db file copy kore
echo   ei folder-er db\custom.db te paste korun, then START.bat.
echo.
pause
