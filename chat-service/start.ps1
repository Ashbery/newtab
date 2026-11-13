$ErrorActionPreference = 'Stop'
$runtimePath = $PSScriptRoot
$nodePath = (Get-Content -LiteralPath (Join-Path $runtimePath 'node-path.txt') -Raw).Trim()
$serverPath = Join-Path $runtimePath 'server.mjs'
$existing = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
    $_.ExecutablePath -eq $nodePath -and $_.CommandLine -like ('*"' + $serverPath + '"*')
}
if (!$existing) {
    Start-Process -FilePath $nodePath -ArgumentList ('"' + $serverPath + '"') -WorkingDirectory $runtimePath -WindowStyle Hidden | Out-Null
}
