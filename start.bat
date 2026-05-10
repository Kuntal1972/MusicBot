@echo off
title YouTube Music Bot
cd /d "%~dp0"

echo Stopping any previous server instances...
taskkill /F /IM node.exe >nul 2>&1
taskkill /F /IM python.exe >nul 2>&1
timeout /t 2 /nobreak >nul

echo Starting YouTube Music Bot...
node server.js
pause
