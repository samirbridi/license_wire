param([string]$Release)
$ErrorActionPreference='Stop'
$playoutRoot=Split-Path $PSScriptRoot -Parent
$record=Get-Content -LiteralPath (Join-Path $playoutRoot 'evidence/package-latest.json') -Raw | ConvertFrom-Json
if(-not $Release){$Release=Join-Path $playoutRoot $record.release}
$work=Join-Path $playoutRoot ('binaries/update-install-qa/'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
$target=Join-Path $work 'Portable app with spaces'
$profile=Join-Path $work 'Preserved profile'
New-Item -ItemType Directory -Path $profile | Out-Null
$setup=Join-Path $Release (@($record.artifacts | Where-Object {$_.file -like '*-setup.exe'})[0].file)
$hash=(Get-FileHash -LiteralPath $setup -Algorithm SHA256).Hash.ToLowerInvariant()
$bytes=(Get-Item -LiteralPath $setup).Length
$checks=@();$ok=$false
function Check([string]$name,[bool]$pass){$script:checks+=[pscustomobject]@{name=$name;pass=$pass};if(-not $pass){throw $name}}
function Run([string]$exe,[string]$arguments){$p=Start-Process -FilePath $exe -ArgumentList $arguments -WorkingDirectory $work -WindowStyle Hidden -PassThru;if(-not $p.WaitForExit(180000)){throw 'Update test process timed out'};return $p.ExitCode}
try{
 Check 'isolated portable installation succeeds' ((Run $setup ('/S /QA /PORTABLE /D='+$target)) -eq 0)
 $exe=Join-Path $target 'MizinPlayout.exe'
 $helper=Join-Path $work 'MizinUpdater.exe';Copy-Item -LiteralPath (Join-Path $target 'MizinUpdater.exe') -Destination $helper
 $sentinel=Join-Path $profile 'operator-project.keep';Set-Content -LiteralPath $sentinel -Value 'Preserve this profile and operator media' -Encoding utf8
 $sentinelHash=(Get-FileHash -LiteralPath $sentinel).Hash
 $appHash=(Get-FileHash -LiteralPath $exe).Hash
 foreach($negative in @($true,$false)){
  $board=Join-Path $work $(if($negative){'negative-board'}else{'handoff-board'})
  $parent=Start-Process -FilePath $exe -ArgumentList ('--board --capture-dir "'+$board+'" --state-dir "'+$profile+'"') -WindowStyle Hidden -WorkingDirectory $work -PassThru
  $digest=if($negative){'0'*64}else{$hash}
  $args='--qa --no-restart --portable --parent-pid '+$parent.Id+' --installer "'+$setup+'" --sha256 '+$digest+' --size '+$bytes+' --target "'+$target+'" --restart "'+$exe+'" --state-dir "'+$profile+'" --lang pt-BR'
  $exit=Run $helper $args
  Check $(if($negative){'corrupt installer hash is rejected before replacement'}else{'verified handoff waits for parent exit and installs'}) $(if($negative){$exit -eq 4 -and (Get-FileHash -LiteralPath $exe).Hash -eq $appHash}else{$exit -eq 0 -and $parent.HasExited})
  if(-not $parent.WaitForExit(15000)){throw 'Capture parent did not finish'}
 }
 Check 'portable update keeps registration marker absent' (-not(Test-Path -LiteralPath (Join-Path $target 'installation.ini')) -and -not(Test-Path -LiteralPath (Join-Path $target 'Uninstall.exe')))
 Check 'operator profile is byte-for-byte preserved' ((Get-FileHash -LiteralPath $sentinel).Hash -eq $sentinelHash)
 $meta=Join-Path $work 'updated-runtime.json'
 Check 'updated application restarts successfully' ((Run $exe ('--runtime-info "'+$meta+'" --state-dir "'+$profile+'"')) -eq 0)
 $data=Get-Content -LiteralPath $meta -Raw | ConvertFrom-Json
 Check 'updated app retains version and explicit profile' ($data.version -eq $record.version -and $data.state_dir.Replace('/','\') -eq $profile)
 # Exercise the helper's real restart path too. Only this isolated test process
 # is closed after launch; no existing operator application is selected.
 $parent=Start-Process -FilePath $exe -ArgumentList ('--board --capture-dir "'+(Join-Path $work 'restart-board')+'" --state-dir "'+$profile+'"') -WindowStyle Hidden -WorkingDirectory $work -PassThru
 $before=@((Get-Process -Name MizinPlayout -ErrorAction SilentlyContinue).Id)
 Check 'verified installer and native restart complete' ((Run $helper ('--qa --portable --parent-pid '+$parent.Id+' --installer "'+$setup+'" --sha256 '+$hash+' --size '+$bytes+' --target "'+$target+'" --restart "'+$exe+'" --state-dir "'+$profile+'" --lang pt-BR')) -eq 0)
 Start-Sleep -Seconds 2
 $restarted=@(Get-Process -Name MizinPlayout -ErrorAction SilentlyContinue | Where-Object {$_.Id -notin $before -and $_.Path -eq $exe})
 Check 'helper restarts exactly the isolated updated app' ($restarted.Count -eq 1)
 foreach($p in $restarted){$null=$p.CloseMainWindow();if(-not $p.WaitForExit(15000)){throw 'Restarted QA app did not close normally'}}
 Check 'profile survives actual restart' ((Get-FileHash -LiteralPath $sentinel).Hash -eq $sentinelHash)
 $ok=$true
} finally {
 $id=[regex]::Match($record.version,'build (\d+)').Groups[1].Value
 [ordered]@{version=$record.version;source_commit=$record.source_commit;result=if($ok){'PASS'}else{'FAIL'};checks=$checks;work=$work;scope='Real native helper waits for an isolated parent, rejects wrong hash, invokes NSIS portable update, preserves profile and restarts the updated app. Same-host QA, not clean-machine qualification.'} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $playoutRoot "evidence/update-install-$id.json") -Encoding utf8
}
[pscustomobject]@{version=$record.version;result='PASS';checks=$checks.Count;work=$work}|ConvertTo-Json
