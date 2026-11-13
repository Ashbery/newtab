param([switch]$NoStart)
$ErrorActionPreference = 'Stop'
$serviceSource = $PSScriptRoot
$serviceRoot = Join-Path $env:LOCALAPPDATA 'AshberyNewtabChat'
$runtimePath = Join-Path $serviceRoot 'runtime'
$nodePath = (Get-Command node.exe -ErrorAction Stop).Source
$previousNodeFile = Join-Path $runtimePath 'node-path.txt'
$ownedNodePaths = @($nodePath)
if (Test-Path -LiteralPath $previousNodeFile) { $ownedNodePaths += (Get-Content -LiteralPath $previousNodeFile -Raw).Trim() }
$npmPath = (Get-Command npm.cmd -ErrorAction Stop).Source
$nodeVersion = & $nodePath -p 'process.versions.node'
if ([version]$nodeVersion -lt [version]'22.12.0') { throw 'Node.js 22.12 or newer is required.' }
New-Item -ItemType Directory -Force -Path $runtimePath, (Join-Path $runtimePath 'vendor') | Out-Null
# Stop only an earlier copy of this helper from its exact installation path.
$serverPath = Join-Path $runtimePath 'server.mjs'
Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
    $_.ExecutablePath -in $ownedNodePaths -and $_.CommandLine -like ('*"' + $serverPath + '"*')
} | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction Stop }
foreach ($name in @('server.mjs', 'dpapi.mjs', 'package.json', 'package-lock.json', 'start.ps1', 'uninstall.ps1', 'README.md')) {
    Copy-Item -LiteralPath (Join-Path $serviceSource $name) -Destination (Join-Path $runtimePath $name) -Force
}
Copy-Item -LiteralPath (Join-Path $serviceSource 'vendor\siwc-local-0.1.0.tgz') -Destination (Join-Path $runtimePath 'vendor\siwc-local-0.1.0.tgz') -Force
Push-Location $runtimePath
try {
    & $npmPath ci --omit=dev --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw 'Chat service dependencies could not be installed.' }
} finally { Pop-Location }
$nodePath | Set-Content -LiteralPath (Join-Path $runtimePath 'node-path.txt') -Encoding UTF8
$startupPath = [Environment]::GetFolderPath('Startup')
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut((Join-Path $startupPath 'Ashbery Newtab Chat.lnk'))
$shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$shortcut.Arguments = '-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $runtimePath 'start.ps1') + '"'
$shortcut.WorkingDirectory = $runtimePath
$shortcut.WindowStyle = 7
$shortcut.Description = 'Local ChatGPT connection for Ashbery Newtab'
$shortcut.Save()
if (!$NoStart) { & (Join-Path $runtimePath 'start.ps1') }
Write-Output 'Installed Ashbery Newtab Chat for this Windows user. Account authorization is still required in the newtab chat panel.'
