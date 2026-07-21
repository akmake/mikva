@echo off
chcp 65001 >nul
title Mikva Launcher
cd /d "%~dp0"

echo ============================================
echo   מפעיל את השרת ואת הקליינט...
echo ============================================
echo.

REM --- בדיקה שהותקנו התלויות ---
if not exist "server\node_modules" (
    echo [!] לא נמצאו תלויות בשרת - מריץ התקנה...
    call npm install --prefix server
)
if not exist "client\node_modules" (
    echo [!] לא נמצאו תלויות בקליינט - מריץ התקנה...
    call npm install --prefix client
)

REM --- הפעלת השרת בחלון נפרד (נשאר פתוח עם הלוגים) ---
start "MIKVA SERVER" cmd /k "chcp 65001 >nul & cd /d "%~dp0server" & npm run dev"

REM --- הפעלת הקליינט בחלון נפרד (נשאר פתוח עם הלוגים) ---
start "MIKVA CLIENT" cmd /k "chcp 65001 >nul & cd /d "%~dp0client" & npm run dev"

echo.
echo [✓] השרת והקליינט עלו בשני חלונות נפרדים.
echo     סגור את החלונות הללו כדי לעצור אותם.
echo.
echo אפשר לסגור את החלון הזה.
timeout /t 4 >nul
