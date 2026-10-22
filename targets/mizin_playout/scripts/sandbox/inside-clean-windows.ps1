# Runs INSIDE Windows Sandbox (a clean, disposable Windows with no Visual C++ runtime, Qt or NDI).
# Mapped read-only: C:\Release (Setup + portable ZIP), C:\Fixtures (media). Writable: C:\Results.
# Checks exactly what beta testers hit: Setup without administrator, then the portable ZIP.
$ErrorActionPreference='Continue'
$results='C:\Results';New-Item -ItemType Directory -Path $results -Force | Out-Null
$log=Join-Path $results 'sandbox.log';$checks=@()
function Log($text){Add-Content -LiteralPath $log -Value ("[{0:HH:mm:ss}] {1}" -f (Get-Date),$text)}
function Check($name,$pass,$detail=''){$script:checks+=[pscustomobject]@{name=$name;pass=[bool]$pass;detail="$detail"};Log("$name -> $pass $detail")}
function Run($exe,$arguments,$seconds=180){
  $p=Start-Process -FilePath $exe -ArgumentList $arguments -PassThru -WindowStyle Hidden
  if(-not $p.WaitForExit($seconds*1000)){$p.Kill();return -999};return $p.ExitCode
}
try{
  $setup=Get-ChildItem C:\Release -Filter '*-setup.exe' | Select-Object -First 1
  $zip=Get-ChildItem C:\Release -Filter '*-portable.zip' | Select-Object -First 1
  Check 'release files are mapped' ($setup -and $zip) "$($setup.Name) | $($zip.Name)"
  $vc=Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\VisualStudio\14.0\VC\Runtimes\x64' -ErrorAction SilentlyContinue
  Check 'clean machine has no machine-wide VC++ runtime' (-not $vc) $(if($vc){"installed $($vc.Version)"}else{'none'})
  $admin=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
  Log "sandbox user is administrator: $admin (Setup must not need it either way)"

  # 1) Setup, silent, per-user default folder.
  $code=Run $setup.FullName '/S'
  $installDir=Join-Path $env:LOCALAPPDATA 'Programs\Mizin Playout Preview'
  $exe=Join-Path $installDir 'MizinPlayout.exe'
  Check 'setup exits successfully' ($code -eq 0) "exit $code"
  Check 'setup installed the app' (Test-Path $exe) $installDir
  Check 'app-local Microsoft runtime installed beside the app' ((Test-Path (Join-Path $installDir 'vcruntime140.dll')) -and (Test-Path (Join-Path $installDir 'msvcp140.dll')))
  Check 'start menu shortcut created' (Test-Path (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Mizin Playout Preview\Mizin Playout.lnk'))
  $info=Join-Path $results 'installed-runtime-info.json'
  $code=Run $exe "--runtime-info `"$info`"" 60
  Check 'installed app starts on a clean machine' ($code -eq 0 -and (Test-Path $info)) "exit $code"
  $smoke=Join-Path $results 'installed-smoke.json'
  $code=Run $exe "--smoke-test --cpu --fixtures C:\Fixtures --result `"$smoke`" --state-dir `"$env:TEMP\mizin-smoke`"" 300
  $smokeData=if(Test-Path $smoke){Get-Content $smoke -Raw | ConvertFrom-Json}else{$null}
  Check 'installed app decodes the fixture media (CPU)' ($smokeData -and $smokeData.result -eq 'PASS') "exit $code"
  # Normal launch: the operator window must appear (software rendering in the sandbox).
  $p=Start-Process -FilePath $exe -PassThru;$visible=$false
  for($i=0;$i -lt 60 -and -not $visible;$i++){Start-Sleep -Milliseconds 500;$p.Refresh();$visible=$p.MainWindowHandle -ne [IntPtr]::Zero}
  Check 'installed app opens its window' $visible $p.MainWindowTitle
  if(-not $p.HasExited){$null=$p.CloseMainWindow();if(-not $p.WaitForExit(10000)){$p.Kill()}}
  $uninstaller=Join-Path $installDir 'Uninstall.exe'
  $code=Run $uninstaller '/S';Start-Sleep -Seconds 3
  Check 'uninstaller removes the app' (-not (Test-Path $exe)) "exit $code"

  # 2) Portable ZIP in a folder with spaces and accents.
  $portable=Join-Path $env:USERPROFILE 'Desktop\Mizin portátil teste'
  Expand-Archive -LiteralPath $zip.FullName -DestinationPath $portable -Force
  $pexe=Get-ChildItem $portable -Recurse -Filter MizinPlayout.exe | Select-Object -First 1
  $pinfo=Join-Path $results 'portable-runtime-info.json'
  $code=if($pexe){Run $pexe.FullName "--portable --runtime-info `"$pinfo`"" 60}else{-1}
  Check 'portable app starts on a clean machine' ($code -eq 0 -and (Test-Path $pinfo)) "exit $code"
}catch{Check 'sandbox script completed' $false $_.Exception.Message}
$all=@($checks | Where-Object {-not $_.pass}).Count -eq 0 -and $checks.Count -ge 10
[ordered]@{result=if($all){'PASS'}else{'FAIL'};checks=$checks;windows=(Get-CimInstance Win32_OperatingSystem).Caption+' '+(Get-CimInstance Win32_OperatingSystem).Version;scope='Windows Sandbox: clean Windows, no VC++ runtime/Qt/NDI preinstalled, software rendering. Not a physical display/GPU/NDI qualification.'} | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $results 'sandbox-result.json') -Encoding utf8
Set-Content -LiteralPath (Join-Path $results 'done.txt') -Value 'done'
