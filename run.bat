@echo off
setlocal EnableExtensions

cd /d "%~dp0"

set "APP_DIR=artifacts\upz-landing"
set "PORT=5173"
set "BASE_PATH=/"

:find_port
netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul 2>nul
if not errorlevel 1 (
  set /a PORT+=1
  goto find_port
)

echo.
echo [Optima] Frontend build + run
echo [Optima] Root: %CD%
echo [Optima] App: %APP_DIR%
echo [Optima] Port: %PORT%
echo.

where pnpm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] pnpm topilmadi.
  echo Install:
  echo   npm install -g pnpm
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo [Optima] Dependencies install...
  call pnpm install --frozen-lockfile
  if errorlevel 1 goto failed
)

echo [Optima] Emoji metadata generate...
call pnpm --dir "%APP_DIR%" run generate:emojis
if errorlevel 1 goto failed

echo [Optima] Frontend typecheck...
call pnpm --dir "%APP_DIR%" run typecheck
if errorlevel 1 goto failed

echo [Optima] Frontend production build...
call pnpm --dir "%APP_DIR%" run build
if errorlevel 1 goto failed

echo.
echo [Optima] Ready.
echo [Optima] URL: http://localhost:%PORT%
echo [Optima] Stop: Ctrl+C
echo.

call pnpm --dir "%APP_DIR%" exec vite --config vite.config.ts --host 0.0.0.0 --port %PORT%
set "EXIT_CODE=%ERRORLEVEL%"
echo.
echo [Optima] Dev server stopped. Exit code: %EXIT_CODE%
echo [Optima] Agar xato bo'lsa, yuqoridagi logni yuboring.
pause
exit /b %EXIT_CODE%

:failed
echo.
echo [ERROR] Run failed. Yuqoridagi logga qarang.
pause
exit /b 1
