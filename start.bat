@echo off
rem Yageo 2327 -> 1000 countdown dashboard (double-click to run)
cd /d "%~dp0"
start "" http://localhost:8327
node server.js
pause
