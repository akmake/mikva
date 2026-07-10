# Builds the debug APK for the mobile app.
# Run in a NORMAL terminal (PowerShell) -- not through an isolated tool shell.
#
#   powershell -ExecutionPolicy Bypass -File .\build-apk.ps1
#
# Requires: Android SDK installed, and a JDK 17/21 (uses Android Studio's bundled JDK).

$ErrorActionPreference = 'Stop'
$here = Split-Path -Parent $MyInvocation.MyCommand.Definition

# Android Studio's bundled JDK (JDK 21) -- compatible with Capacitor 6's Gradle/AGP
$jbr = "C:\Program Files\Android\Android Studio\jbr"
if (-not (Test-Path "$jbr\bin\java.exe")) {
  throw "JDK not found at $jbr -- install Android Studio or point JAVA_HOME to a JDK 17/21."
}
$env:JAVA_HOME = $jbr
$env:Path = "$jbr\bin;$env:Path"

Write-Host "==> Building web bundle (vite)..." -ForegroundColor Cyan
npm --prefix "$here" run build

Write-Host "==> Syncing to Android (cap sync)..." -ForegroundColor Cyan
# חייב לרוץ מתוך תיקיית mobile — `npx --prefix` לא עובד עם cap ומשאיר את נכסי
# האנדרואיד ישנים (ה-APK נבנה עם dist ישן). Push-Location מבטיח סנכרון אמיתי.
Push-Location $here
try {
  npx cap sync android
  if ($LASTEXITCODE -ne 0) { throw "cap sync failed (exit $LASTEXITCODE)" }
} finally { Pop-Location }

Write-Host "==> Gradle assembleDebug..." -ForegroundColor Cyan
Push-Location "$here\android"
try {
  cmd /c ".\gradlew.bat assembleDebug"
  if ($LASTEXITCODE -ne 0) { throw "Gradle failed (exit $LASTEXITCODE)" }
} finally { Pop-Location }

$apk = Join-Path $here "android\app\build\outputs\apk\debug\app-debug.apk"
if (Test-Path $apk) {
  Write-Host "`nOK - APK ready:" -ForegroundColor Green
  Write-Host "   $apk" -ForegroundColor Green
} else {
  throw "Build finished but no APK at expected path: $apk"
}
