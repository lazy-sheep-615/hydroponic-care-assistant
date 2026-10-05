@echo off
setlocal
cd /d "%~dp0"
title Hydro Care Assistant
mode con: cols=68 lines=14

rem ---------- Node.js ----------
set "NODE_EXE=C:\Users\wu xu\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\node\bin\node.exe"
if not exist "%NODE_EXE%" set "NODE_EXE=node"

rem ---------- already running? then just open the window ----------
powershell -NoProfile -Command "try{$c=New-Object Net.Sockets.TcpClient;$c.Connect('127.0.0.1',8787);$c.Close();exit 0}catch{exit 1}"
if not errorlevel 1 (
  echo Assistant is already running. Opening the window...
  start "" powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0open_app.ps1" -Delay 0
  timeout /t 3 /nobreak >nul
  exit /b 0
)

rem ---------- open the app window after the server is up, then run the server ----------
start "" /b powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0open_app.ps1" -Delay 2

"%NODE_EXE%" server.js

echo.
echo [stopped] Assistant closed. Data is kept in the data folder.
pause
exit /b 0
