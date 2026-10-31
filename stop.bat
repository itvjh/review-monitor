@echo off
rem Stops everything start.bat started (collector :3010, dashboard :3020, n8n :5678) and any crawl still running (n8n execute holds port 5690), even if its window was closed.
chcp 65001 >nul
title GBP Review Monitor - dung
powershell -NoProfile -Command "Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*start-all.js*' } | ForEach-Object { taskkill /pid $_.ProcessId /T /F | Out-Null }; Get-CimInstance Win32_Process -Filter \"Name='node.exe'\" | Where-Object { $_.CommandLine -like '*n8n*execute*' } | ForEach-Object { taskkill /pid $_.ProcessId /T /F | Out-Null }; foreach ($p in 3010,3020,5678) { Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }; Get-CimInstance Win32_Process -Filter \"Name='chrome.exe'\" | Where-Object { $_.CommandLine -like '*collector*profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }"
echo Da dung collector, dashboard va n8n.
timeout /t 3 >nul
