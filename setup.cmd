@echo off
rem One-click setup: installs dependencies and (optionally) starts the bridge with Windows.
cd /d "%~dp0"
where node >nul 2>nul || (echo Node.js 20+ is required: https://nodejs.org/ & pause & exit /b 1)
if not exist .env copy .env.example .env >nul
call npm install --omit=dev || (echo npm install failed & pause & exit /b 1)
set /p AUTOSTART="Start the bridge automatically when you log in? [y/N] "
if /i "%AUTOSTART%"=="y" call npm run install-startup
echo.
echo Done. Start now with:  node index.js   (or double-click launch-bridge.vbs)
pause
