@echo off
title Mikva launcher
cd /d "%~dp0"

echo Closing old servers on ports 3000 and 5001 (if any)...
powershell -NoProfile -Command "foreach ($p in 3000,5001) { Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }"

echo Starting API server (port 5001)...
start "Mikva Server" /d "%~dp0server" cmd /k npm run dev

echo Starting client (port 3000)...
start "Mikva Client" /d "%~dp0client" cmd /k npm run dev

echo Waiting for the servers to come up...
timeout /t 8 /nobreak >nul

echo Opening the browser...
start "" "http://localhost:3000"

echo.
echo Done. Two windows are running the servers - close them to stop the app.
timeout /t 5 >nul
