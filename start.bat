@echo off
rem Starts collector, dashboard (+ posting queue) and n8n (daily 09:00 schedule). Double-click it, or run it from Task Scheduler.
chcp 65001 >nul
title GBP Review Monitor
cd /d "%~dp0"
echo Dang khoi dong he thong. Giu cua so nay mo; nhan Ctrl+C de dung.
echo.
call npm start
echo.
echo He thong da dung. Nhan phim bat ky de dong cua so.
pause >nul
