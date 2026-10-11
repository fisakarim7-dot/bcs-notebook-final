@echo off
title BCS Notebook - Push to GitHub
echo.
echo   ============================================
echo    BCS Notebook - pushing to GitHub / Vercel
echo   ============================================
echo.

if not exist "package.json" (
   echo   [ERROR] This is not the app folder!
   echo   Double-click PUSH-UPDATE.bat INSIDE the folder
   echo   that contains package.json.
   echo.
   pause
   exit /b 1
)

echo   [1/5] init repository...
git init -q

echo   [2/5] add GitHub remote...
git remote remove origin 2>nul
git remote add origin https://github.com/fisakarim7-dot/bcs-notebook-final.git

echo   [3/5] add files...
git add -A

echo   [4/5] commit...
git commit -q -m "update from laptop pack"

echo   [5/5] push (may take a minute)...
git branch -M main
git push -f origin main
git push -f origin main:master 2>nul

echo.
echo   Push done. Now wait for the Vercel deployment
echo   to become Ready, then hard-refresh your phone.
echo.
pause
