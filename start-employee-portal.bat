@echo off
cd /d "C:\projects\ACE\.claude\worktrees\elegant-mclean"

:: Check if already running on port 3001
netstat -ano | findstr ":3001 " | findstr "LISTENING" >nul 2>&1
if %errorlevel% == 0 (
    start "" "http://localhost:3001"
    exit /b
)

:: Start the server
start "" "C:\Program Files\nodejs\node.exe" server.js

:: Wait for server to be ready then open browser
timeout /t 3 /nobreak >nul
start "" "http://localhost:3001"
