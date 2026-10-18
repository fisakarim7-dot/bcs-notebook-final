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
echo.
echo   [1/6] init repository...
git init -q
echo   [2/6] add GitHub remote...
git remote remove origin 2>nul
git remote add origin https://github.com/fisakarim7-dot/bcs-notebook-final.git
echo   [3/6] add files...
git add -A
echo   [4/6] commit...
git commit -q -m "update from laptop pack"
echo   [5/6] push MAIN branch (may take a minute)...
git branch -M main
git push -f origin main
if errorlevel 1 (
   echo.
   echo   [!!!] FAILED to push the 'main' branch.
   echo   Likely cause: 'main' is branch-protected on GitHub,
   echo   which blocks force-push. 'master' below may still succeed.
   echo.
   echo   Fix - choose ONE:
   echo   A) Vercel -^> bcs-notebook-final -^> Settings -^> Git
   echo      -^> Production Branch = master -^> Save, then promote
   echo      the latest 'master' deployment to Production.
   echo      No re-push needed - the code is already on master.
   echo   B) GitHub repo -^> Settings -^> Rules -^> allow force-push
   echo      on 'main' ^(or delete the rule^), then run this bat again.
   echo.
) else (
   echo   main push: OK
)
echo.
echo   [6/6] push MASTER branch ^(backup^)...
git push -f origin main:master
if errorlevel 1 (
   echo   master push: FAILED - see the error above.
) else (
   echo   master push: OK
)
echo.
echo   Done. Wait for the Vercel deployment to become Ready,
echo   then hard-refresh your phone.
echo.
pause
