@echo off
cd /d "%~dp0"
title AUTOPRINT Cloud Spooling Hub
echo ========================================================
echo         AUTOPRINT Zero-Touch Printing Engine
echo ========================================================
echo.
echo Starting Backend Server, Print Agent, and Customer UI...
echo.
npm run dev
pause
