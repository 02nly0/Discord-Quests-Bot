@echo off
setlocal EnableExtensions
title Discord Quests Bot
cd /d "%~dp0..\.."

echo.
echo ==========================================
echo  Discord Quests Bot
echo ==========================================
echo.

if not exist "package.json" (
    echo Could not find package.json.
    echo Keep the scripts folder inside the repository and run run.bat again.
    goto :failed
)

where bun >nul 2>&1
if errorlevel 1 (
    echo Bun is not installed. Double-click install.bat first.
    goto :failed
)

if not exist "node_modules" (
    echo Project dependencies are missing. Double-click install.bat first.
    goto :failed
)

if not exist ".env" (
    echo The .env file is missing. Double-click install.bat first.
    goto :failed
)

echo Starting the bot. Press Ctrl+C to stop it.
echo.
bun run start
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if "%EXIT_CODE%"=="0" (
    echo The bot has stopped.
) else (
    echo The bot stopped with an error. Check the messages above.
)
echo.
pause
exit /b %EXIT_CODE%

:failed
echo.
pause
exit /b 1
