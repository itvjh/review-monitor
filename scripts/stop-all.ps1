# Stops everything start.bat started: the start-all launcher, anything listening on the service ports, a crawl still running (n8n execute) and the collector's own Chrome.
$node = Get-CimInstance Win32_Process -Filter "Name='node.exe'"
$node | Where-Object { $_.CommandLine -like '*start-all.js*' } | ForEach-Object { taskkill /pid $_.ProcessId /T /F | Out-Null }
$node | Where-Object { $_.CommandLine -like '*n8n*execute*' } | ForEach-Object { taskkill /pid $_.ProcessId /T /F | Out-Null }
foreach ($port in 3010, 3020, 5678) {
  Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
}
Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*collector*profile*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
