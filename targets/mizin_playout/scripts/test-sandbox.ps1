# Clean-Windows installer test in Windows Sandbox (release gate "clean Windows machine").
# One-time setup (administrator PowerShell, then reboot):
#   Enable-WindowsOptionalFeature -Online -FeatureName Containers-DisposableClientVM -All
# Usage: powershell -File scripts/test-sandbox.ps1 [-Release <release folder>]
param([string]$Release,[int]$TimeoutMinutes=15)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$sandbox=Join-Path $env:windir 'System32\WindowsSandbox.exe'
if(-not(Test-Path -LiteralPath $sandbox)){throw 'Windows Sandbox is not enabled. Run (as administrator): Enable-WindowsOptionalFeature -Online -FeatureName Containers-DisposableClientVM -All  and reboot.'}
$record=Get-Content -LiteralPath (Join-Path $root 'evidence/package-latest.json') -Raw | ConvertFrom-Json
if(-not $Release){$Release=Join-Path $root $record.release}
$id=[regex]::Match($record.version,'build (\d+)').Groups[1].Value
$work=Join-Path $root ('binaries/sandbox-qa/'+$id+'-'+[guid]::NewGuid().ToString('N').Substring(0,8))
$results=Join-Path $work 'results';$stage=Join-Path $work 'release'
New-Item -ItemType Directory -Path $results,$stage -Force | Out-Null
# Only the two artifacts go into the sandbox (read-only), plus the fixtures and the inside script.
Get-ChildItem -LiteralPath $Release -File | Where-Object {$_.Name -match '-(setup\.exe|portable\.zip)$'} | Copy-Item -Destination $stage
$scripts=Join-Path $PSScriptRoot 'sandbox';$fixtures=Join-Path $root 'binaries/fixtures'
$config=@"
<Configuration>
  <VGpu>Disable</VGpu>
  <Networking>Disable</Networking>
  <MappedFolders>
    <MappedFolder><HostFolder>$stage</HostFolder><SandboxFolder>C:\Release</SandboxFolder><ReadOnly>true</ReadOnly></MappedFolder>
    <MappedFolder><HostFolder>$fixtures</HostFolder><SandboxFolder>C:\Fixtures</SandboxFolder><ReadOnly>true</ReadOnly></MappedFolder>
    <MappedFolder><HostFolder>$scripts</HostFolder><SandboxFolder>C:\Scripts</SandboxFolder><ReadOnly>true</ReadOnly></MappedFolder>
    <MappedFolder><HostFolder>$results</HostFolder><SandboxFolder>C:\Results</SandboxFolder><ReadOnly>false</ReadOnly></MappedFolder>
  </MappedFolders>
  <LogonCommand><Command>powershell -NoProfile -ExecutionPolicy Bypass -File C:\Scripts\inside-clean-windows.ps1</Command></LogonCommand>
</Configuration>
"@
$wsb=Join-Path $work 'clean-install.wsb';Set-Content -LiteralPath $wsb -Value $config -Encoding utf8
Write-Output "Starting Windows Sandbox for $($record.version) ..."
Start-Process -FilePath $sandbox -ArgumentList "`"$wsb`""
$deadline=(Get-Date).AddMinutes($TimeoutMinutes)
while(-not(Test-Path -LiteralPath (Join-Path $results 'done.txt')) -and (Get-Date) -lt $deadline){Start-Sleep -Seconds 5}
$resultFile=Join-Path $results 'sandbox-result.json'
if(-not(Test-Path -LiteralPath $resultFile)){throw "No result after $TimeoutMinutes minutes; see $results"}
Get-Process WindowsSandbox,WindowsSandboxClient -ErrorAction SilentlyContinue | Stop-Process -Force
$data=Get-Content -LiteralPath $resultFile -Raw | ConvertFrom-Json
Copy-Item -LiteralPath $resultFile -Destination (Join-Path $root "evidence/sandbox-clean-install-$id.json") -Force
$data.checks | Format-Table name,pass,detail -AutoSize | Out-String -Width 200 | Write-Output
Write-Output "Sandbox result: $($data.result)"
if($data.result -ne 'PASS'){exit 2}
