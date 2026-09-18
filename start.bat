@echo off
cd /d "%~dp0"
title Get It?

if not exist key.txt (
  echo.
  echo   ============================================
  echo    No key.txt found.
  echo.
  echo    Make a file called key.txt in this folder
  echo    and paste your OpenRouter key inside it.
  echo   ============================================
  echo.
  pause
  exit /b
)

echo.
echo   Starting Get It?...
echo   Your browser will open in a moment.
echo.
echo   Keep this window open while you use it.
echo   Close it to stop the app.
echo.

start "" cmd /c "timeout /t 2 >nul & start http://localhost:4590"

node server.js

echo.
echo   Server stopped.
pause