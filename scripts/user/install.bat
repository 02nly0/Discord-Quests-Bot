@echo off
setlocal EnableExtensions
title Discord Quests Bot - Setup
cd /d "%~dp0..\.."

echo.
echo ==========================================
echo  Discord Quests Bot - Windows setup
echo ==========================================
echo.

if not exist "package.json" (
    echo Could not find package.json.
    echo Keep the scripts folder inside the repository and run install.bat again.
    goto :failed
)

call :ensure_node
if errorlevel 1 goto :failed

call :ensure_bun
if errorlevel 1 goto :failed

echo [3/3] Installing project dependencies...
bun install
if errorlevel 1 (
    echo.
    echo Could not install the project dependencies.
    goto :failed
)

if not exist ".env" (
    copy /y ".env.example" ".env" >nul
    echo.
    echo Created .env from .env.example.
    echo Open .env with Notepad and paste your bot token after DISCORD_TOKEN=.
)

echo.
echo Setup complete. Double-click run.bat to start the bot.
echo.
pause
exit /b 0

:failed
echo.
echo Setup failed. Fix the problem above and run install.bat again.
echo.
pause
exit /b 1

:ensure_node
where node >nul 2>&1
if not errorlevel 1 (
    for /f "delims=" %%v in ('node --version 2^>nul') do echo [1/3] Node.js %%v is already installed. Skipping.
    exit /b 0
)

echo [1/3] Node.js was not found. Installing the latest version...
where winget >nul 2>&1
if errorlevel 1 (
    echo.
    echo Could not find winget, so Node.js cannot be installed automatically.
    echo Install Node.js from https://nodejs.org and run install.bat again.
    exit /b 1
)

winget install --id OpenJS.NodeJS --exact --source winget --accept-package-agreements --accept-source-agreements
set "PATH=%ProgramFiles%\nodejs;%PATH%"

where node >nul 2>&1
if errorlevel 1 (
    echo.
    echo Node.js could not be installed automatically.
    echo Install Node.js from https://nodejs.org and run install.bat again.
    exit /b 1
)

echo Node.js installed.
exit /b 0

:ensure_bun
where bun >nul 2>&1
if not errorlevel 1 (
    for /f "delims=" %%v in ('bun --version 2^>nul') do echo [2/3] Bun %%v is already installed. Skipping.
    exit /b 0
)

echo [2/3] Bun was not found. Installing the latest version...
powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://bun.sh/install.ps1 | iex"
set "PATH=%USERPROFILE%\.bun\bin;%PATH%"

where bun >nul 2>&1
if errorlevel 1 (
    echo.
    echo Bun could not be installed automatically.
    echo Install Bun from https://bun.sh and run install.bat again.
    exit /b 1
)

echo Bun installed.
exit /b 0
