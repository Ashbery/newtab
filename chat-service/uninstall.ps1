$ErrorActionPreference = 'Stop'
$runtimePath = $PSScriptRoot
$nodePath = (Get-Content -LiteralPath (Join-Path $runtimePath 'node-path.txt') -Raw).Trim()
$serverPath = Join-Path $runtimePath 'server.mjs'
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
    $_.ExecutablePath -eq $nodePath -and $_.CommandLine -like ('*"' + $serverPath + '"*')
} | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction Stop }
$shortcutPath = Join-Path ([Environment]::GetFolderPath('Startup')) 'Ashbery Newtab Chat.lnk'
if (Test-Path -LiteralPath $shortcutPath) { Remove-Item -LiteralPath $shortcutPath }
Write-Output 'Stopped the helper and removed startup. Files and encrypted account remain; use Disconnect in the chat panel before uninstalling to revoke authorization.'
