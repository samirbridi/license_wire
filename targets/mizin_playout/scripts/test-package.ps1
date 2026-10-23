param([string]$Release,[switch]$ShellRegistration)
$ErrorActionPreference='Stop'
$playoutRoot=Split-Path $PSScriptRoot -Parent
$record=Get-Content -LiteralPath (Join-Path $playoutRoot 'evidence/package-latest.json') -Raw | ConvertFrom-Json
if(-not $Release){$Release=Join-Path $playoutRoot $record.release}
$Release=(Resolve-Path -LiteralPath $Release).Path
$work=Join-Path $playoutRoot ('binaries/package-qa/'+[guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
$script:checks=@()
$script:runs=@()
$completed=$false
function Check([string]$name,[bool]$pass,$detail){
    $script:checks+=[pscustomobject]@{name=$name;pass=$pass;detail=$detail}
    if(-not $pass){throw "Package check failed: $name"}
}
function RunNative([string]$exe,[string]$arguments,[string]$label,[bool]$modules=$false){
    $env:MIZIN_LOG_PATH=Join-Path $work "$label.log"
    $process=Start-Process -FilePath $exe -ArgumentList $arguments -WorkingDirectory $work -WindowStyle Hidden -PassThru
    $loaded=@()
    if($modules){
        Start-Sleep -Milliseconds 1000
        if(-not $process.HasExited){$loaded=@((Get-Process -Id $process.Id).Modules | ForEach-Object {$_.FileName})}
    }
    if(-not $process.WaitForExit(180000)){ $process.Kill(); throw "Native test timeout: $label" }
    $exitCode=$process.ExitCode
    $script:runs+=[pscustomobject]@{name=$label;exe=$exe;arguments=$arguments;exit=$exitCode;loaded_modules=$loaded;log=$env:MIZIN_LOG_PATH}
    Check "$label exits successfully" ($exitCode -eq 0) $exitCode
    return $loaded
}
$saved=@{}
foreach($key in @('PATH','QT_PLUGIN_PATH','QT_QPA_PLATFORM_PLUGIN_PATH','QML2_IMPORT_PATH','MIZIN_LOG_PATH')){$saved[$key]=[Environment]::GetEnvironmentVariable($key,'Process')}
try{
    $env:PATH="$env:SystemRoot\System32;$env:SystemRoot"
    foreach($key in @('QT_PLUGIN_PATH','QT_QPA_PLATFORM_PLUGIN_PATH','QML2_IMPORT_PATH')){[Environment]::SetEnvironmentVariable($key,$null,'Process')}
    foreach($artifact in $record.artifacts){
        $file=Join-Path $Release $artifact.file
        Check ('artifact hash '+$artifact.file) ((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -eq $artifact.sha256) $artifact.sha256
    }
    $archive=Join-Path $Release (@($record.artifacts | Where-Object {$_.file -like '*.zip'})[0].file)
    $expanded=Join-Path $work 'ZIP com espacos'
    Expand-Archive -LiteralPath $archive -DestinationPath $expanded
    $appDir=(Get-ChildItem -LiteralPath $expanded -Directory | Select-Object -First 1).FullName
    $exe=Join-Path $appDir 'MizinPlayout.exe'
    $manifest=Get-Content -LiteralPath (Join-Path $appDir 'package-manifest.json') -Raw | ConvertFrom-Json
    $bad=@($manifest.files | Where-Object {(Get-FileHash -LiteralPath (Join-Path $appDir $_.path) -Algorithm SHA256).Hash.ToLowerInvariant() -ne $_.sha256})
    Check 'all portable payload hashes match' ($bad.Count -eq 0) $manifest.files.Count
    Check 'no development state SDK or fixtures shipped' (@($manifest.files | Where-Object {$_.path -match '^(state|binaries|build|\.git)/'}).Count -eq 0) $null
    Check 'official NDI DLL is private and signed' ((Test-Path -LiteralPath (Join-Path $appDir 'Processing.NDI.Lib.x64.dll')) -and (Get-AuthenticodeSignature -LiteralPath (Join-Path $appDir 'Processing.NDI.Lib.x64.dll')).Status -eq 'Valid') $null
    Check 'NDI vendor notices are present' ((Test-Path -LiteralPath (Join-Path $appDir 'licenses/ndi/Processing.NDI.Lib.Licenses.txt')) -and (Test-Path -LiteralPath (Join-Path $appDir 'licenses/ndi/NDI SDK License Agreement.pdf'))) $null
    Check 'native update helper has matching build resource' ((Get-Item -LiteralPath (Join-Path $appDir 'MizinUpdater.exe')).VersionInfo.ProductVersion -eq $record.version) $null
    $resource=(Get-Item -LiteralPath $exe).VersionInfo
    Check 'EXE resource version matches build' ($resource.ProductVersion -eq $record.version) $resource.ProductVersion
    foreach($mode in @('default','portable','override')){
        $report=Join-Path $work "$mode.json"
        $args='--runtime-info "'+$report+'"'
        if($mode -eq 'portable'){$args+=' --portable'}
        if($mode -eq 'override'){$args+=' --portable --state-dir "'+(Join-Path $work 'explicit state')+'"'}
        $null=RunNative $exe $args "metadata-$mode"
        $data=Get-Content -LiteralPath $report -Raw | ConvertFrom-Json
        $expected=if($mode -eq 'default'){Join-Path $env:LOCALAPPDATA 'Mizin/Mizin Playout'}elseif($mode -eq 'portable'){Join-Path $appDir 'state'}else{Join-Path $work 'explicit state'}
        Check "$mode profile path is correct" ($data.state_dir.Replace('/','\') -eq $expected.Replace('/','\')) $data
        Check "$mode metadata matches compiled version and source" ($data.version -eq $record.version -and $data.source_commit -eq $record.source_commit -and $data.default_language -eq 'en') $null
    }
    Check 'runtime-info creates no user preferences' (-not(Test-Path -LiteralPath (Join-Path $appDir 'state'))) $null
    foreach($suite in @('ui','readiness','smoke','web','audio-engine','aes67','link','link-mirror')){
        $fixtures=Join-Path $playoutRoot $(if($suite -eq 'readiness'){'binaries'}elseif($suite -in @('web','audio-engine','aes67')){'binaries/network-fixtures'}else{'binaries/fixtures'})
        $result=Join-Path $work "$suite.json"
        $args='--'+$suite+'-test --fixtures "'+$fixtures+'" --result "'+$result+'" --state-dir "'+(Join-Path $work "$suite-state")+'"'
        if($suite -eq 'smoke'){$args+=' --cpu'}
        $loaded=RunNative $exe $args "portable-$suite" ($suite -eq 'ui')
        $data=Get-Content -LiteralPath $result -Raw | ConvertFrom-Json
        Check "portable $suite native checks pass" ($data.result -eq 'PASS' -and @($data.tests | Where-Object {-not $_.pass}).Count -eq 0) @{checks=$data.tests.Count;file=$result}
        if($suite -eq 'ui'){
            $required=@('Qt6Core.dll','Qt6Widgets.dll','qwindows.dll','vcruntime140.dll','msvcp140.dll')
            foreach($dll in $required){Check ("relocated runtime loads own "+$dll) (@($loaded | Where-Object {([IO.Path]::GetFileName($_) -ieq $dll) -and $_.StartsWith($appDir,[StringComparison]::OrdinalIgnoreCase)}).Count -eq 1) $null}
            Check 'no Qt DLL loaded from developer SDK' (@($loaded | Where-Object {$_ -match '\\binaries\\qt\\'}).Count -eq 0) $null
        }
    }
    $setup=Join-Path $Release (@($record.artifacts | Where-Object {$_.file -like '*-setup.exe'})[0].file)
    $portableInstall=Join-Path $work 'Portable update folder'
    $null=RunNative $setup ('/S /QA /PORTABLE /D='+$portableInstall) 'portable-install'
    Check 'portable setup creates app without uninstall registration marker' ((Test-Path -LiteralPath (Join-Path $portableInstall 'MizinPlayout.exe')) -and -not(Test-Path -LiteralPath (Join-Path $portableInstall 'Uninstall.exe')) -and -not(Test-Path -LiteralPath (Join-Path $portableInstall 'installation.ini'))) $null
    $installed=Join-Path $work 'Instalacao teste'
    $null=RunNative $setup ('/S /QA /D='+$installed) 'install'
    Check 'installer writes EXE and uninstaller' ((Test-Path -LiteralPath (Join-Path $installed 'MizinPlayout.exe')) -and (Test-Path -LiteralPath (Join-Path $installed 'Uninstall.exe'))) $null
    $prefs=Join-Path $installed 'state/preferences.ini'
    New-Item -ItemType Directory -Path (Split-Path $prefs -Parent) | Out-Null
    Set-Content -LiteralPath $prefs -Value "[General]`nlanguage=pt-BR" -Encoding utf8
    $media=Join-Path $installed 'operator-media.keep'
    Set-Content -LiteralPath $media -Value 'Unowned operator file must survive' -Encoding utf8
    $prefHash=(Get-FileHash -LiteralPath $prefs -Algorithm SHA256).Hash
    $null=RunNative $setup ('/S /QA /D='+$installed) 'reinstall'
    Check 'reinstall preserves preferences and operator files' (((Get-FileHash -LiteralPath $prefs -Algorithm SHA256).Hash -eq $prefHash) -and (Test-Path -LiteralPath $media)) $null
    $null=RunNative (Join-Path $installed 'MizinPlayout.exe') ('--portable --runtime-info "'+(Join-Path $work 'installed.json')+'"') 'installed-startup'
    # _?= keeps the uninstaller synchronous. NSIS may leave its own running EXE;
    # the test asserts owned application removal and unknown/profile preservation.
    $null=RunNative (Join-Path $installed 'Uninstall.exe') ('/S _?='+$installed) 'uninstall'
    Check 'uninstall removes owned application files' (-not(Test-Path -LiteralPath (Join-Path $installed 'MizinPlayout.exe')) -and -not(Test-Path -LiteralPath (Join-Path $installed 'Qt6Core.dll')) -and -not(Test-Path -LiteralPath (Join-Path $installed 'package-manifest.json'))) $null
    Check 'uninstall preserves user preferences and media' (((Get-FileHash -LiteralPath $prefs -Algorithm SHA256).Hash -eq $prefHash) -and (Test-Path -LiteralPath $media)) $null
    if($ShellRegistration){
        $key='HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\MizinPlayoutPreview'
        $settingsKey='HKCU:\Software\Mizin\PlayoutPreview'
        $menu=Join-Path ([Environment]::GetFolderPath('Programs')) 'Mizin Playout Preview'
        Check 'normal shell test has no preexisting installation to touch' (-not(Test-Path -LiteralPath $key) -and -not(Test-Path -LiteralPath $settingsKey) -and -not(Test-Path -LiteralPath $menu)) $null
        $normal=Join-Path $work 'Normal shell installation'
        try{
            $null=RunNative $setup ('/S /D='+$normal) 'normal-install'
            $entry=Get-ItemProperty -LiteralPath $key
            Check 'normal uninstall registry version and quotes are correct' ($entry.DisplayVersion -eq $record.version -and $entry.UninstallString -eq ('"'+$normal+'\Uninstall.exe"') -and $entry.QuietUninstallString -eq ('"'+$normal+'\Uninstall.exe" /S')) @{display_version=$entry.DisplayVersion;uninstall=$entry.UninstallString;quiet_uninstall=$entry.QuietUninstallString}
            $shell=New-Object -ComObject WScript.Shell
            $shortcut=$shell.CreateShortcut((Join-Path $menu 'Mizin Playout.lnk'))
            Check 'Start menu shortcut targets installed native EXE' ($shortcut.TargetPath -eq (Join-Path $normal 'MizinPlayout.exe')) $shortcut.TargetPath
        } finally {
            if(Test-Path -LiteralPath (Join-Path $normal 'Uninstall.exe')){
                $null=RunNative (Join-Path $normal 'Uninstall.exe') ('/S _?='+$normal) 'normal-uninstall'
            }
        }
        Check 'normal uninstall removes own registry and shortcuts' (-not(Test-Path -LiteralPath $key) -and -not(Test-Path -LiteralPath $settingsKey) -and -not(Test-Path -LiteralPath $menu)) $null
    }
    $completed=$true
} finally {
    foreach($key in $saved.Keys){[Environment]::SetEnvironmentVariable($key,$saved[$key],'Process')}
    $report=[ordered]@{version=$record.version;source_commit=$record.source_commit;result=if($completed -and @($script:checks | Where-Object {-not $_.pass}).Count -eq 0 -and $script:checks.Count -ge 30){'PASS'}else{'FAIL'};checks=$script:checks;runs=$script:runs;work=$work;shell_registration_tested=[bool]$ShellRegistration;scope='Local relocated package, isolated /QA install/reinstall/uninstall and optional normal per-user shell registration. Existing Windows runtime. No clean VM, prerequisite installation, signing or physical-output qualification.'}
    $id=[regex]::Match($record.version,'build (\d+)').Groups[1].Value
    $report['runner_sha256']=(Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash.ToLowerInvariant()
    $report | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $playoutRoot "evidence/package-validation-$id.json") -Encoding utf8
}
[pscustomobject]$report | Select-Object version,result,@{n='checks';e={$_.checks.Count}},work | ConvertTo-Json
