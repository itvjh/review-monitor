@echo off
rem Runs the workflow once right now (use it when the PC was off at 09:00).
chcp 65001 >nul
title GBP Review Monitor - chay ngay
cd /d "%~dp0"
call npm run crawl
echo.
echo Xong. Nhan phim bat ky de dong cua so.
pause >nul
