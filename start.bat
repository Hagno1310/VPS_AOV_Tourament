@echo off
title UPS LEGENDS - Overlay Server
cd /d "%~dp0"

echo ============================================================
echo    UPS LEGENDS - Overlay Ban/Pick
echo ============================================================
echo.

REM --- Check Node.js ---
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js is not installed on this machine.
  echo Download the LTS version at https://nodejs.org, install it, then run this file again.
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node -v') do echo Node.js version: %%v
echo.

REM --- Install dependencies on first run only ---
if not exist "node_modules" (
  echo First run: installing dependencies ^(npm install^), please wait...
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERROR] npm install failed. Check your Internet connection and try again.
    pause
    exit /b 1
  )
) else (
  echo Dependencies already installed, skipping.
)
echo.

echo Starting server ^(npm run start^)...
echo KEEP this window open while in use. Closing it stops the server.
echo Addresses to open on this PC and on other PCs in the LAN are shown below:
echo.
call npm run start

echo.
echo Server stopped. Press any key to close.
pause >nul
