@echo off
cd /d "%~dp0"
echo Starting VNPAY demo at http://localhost:3000/
echo Press Ctrl+C to stop the server.
echo.
node server.js
pause
