@echo off
rem Stops everything start.bat started (collector :3010, dashboard :3020, n8n :5678) and any crawl still running, even if its window was closed.
chcp 65001 >nul
title GBP Review Monitor - dung
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-all.ps1"
echo Da dung collector, dashboard va n8n.
timeout /t 3 >nul
