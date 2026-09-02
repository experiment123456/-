@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 24 or newer, then reopen this file.
  pause
  exit /b 1
)
node -e "if (Number(process.versions.node.split('.')[0]) < 24) { console.error('Node.js 24 or newer is required.'); process.exit(1); }"
if errorlevel 1 (
  pause
  exit /b 1
)
if not exist "node_modules\vite\package.json" (
  echo Installing locked dependencies. Internet access is needed on the first run.
  call npm.cmd ci
  if errorlevel 1 (
    echo Installation failed. Check your network and retry.
    pause
    exit /b 1
  )
)
echo Open the Local URL printed below. Keep this window open.
call npm.cmd run dev
if errorlevel 1 pause
