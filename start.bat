@echo off
title Mikva Launcher
cd /d "%~dp0"

echo ============================================
echo   Starting SERVER and CLIENT...
echo ============================================
echo.

if not exist "server\node_modules" (
    echo Installing server dependencies...
    call npm install --prefix server
)
if not exist "client\node_modules" (
    echo Installing client dependencies...
    call npm install --prefix client
)

start "MIKVA SERVER" cmd /k "chcp 65001>nul && npm --prefix server run dev"
start "MIKVA CLIENT" cmd /k "chcp 65001>nul && npm --prefix client run dev"

echo.
echo [OK] Server and Client launched in two separate windows.
echo      Each window shows its own logs. Close a window to stop it.
echo.
timeout /t 4 >nul
