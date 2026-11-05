@echo off
rem Doble clic para abrir Repoteca (necesita Node 20+ y git instalados).
cd /d "%~dp0"
where node >nul 2>nul || (echo Falta Node.js 20 o superior: https://nodejs.org & pause & exit /b 1)
where git >nul 2>nul || (echo Falta git: https://git-scm.com & pause & exit /b 1)
node src\server.mjs --open
pause
