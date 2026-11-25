# Builds Plugnex.exe (native Win32 client) against a given server origin,
# the same way package.ps1 generated a fresh BuildConfig.cs per-origin for
# the earlier C# "Mizin Wire" client -- each build is tied to one origin
# and (once reachable) its Ed25519 public key, so swapping environments
# means rebuilding, not reconfiguring a shipped binary.
param(
    [uri]$Origin = 'http://127.0.0.1:4381',
    [string]$OutDir
)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
if (!$OutDir) { $OutDir = Join-Path $root 'build' }
New-Item -ItemType Directory -Force $OutDir | Out-Null

if ($Origin.Scheme -notin @('http','https')) { throw 'Origem precisa ser http ou https.' }
if ($Origin.UserInfo) { throw 'Use uma origem sem credenciais.' }

$targetRoot = Split-Path (Split-Path $root -Parent) -Parent
$versionFile = Join-Path $targetRoot 'VERSION'
$version = if (Test-Path $versionFile) { (Get-Content $versionFile -Raw).Trim() } else { '' }
$numeric = '1,0,0,0'
if ($version -and $version -match '^v(\d+)\.(\d+)\.(\d+) \(build (\d+)\)') {
    $numeric = "$($Matches[1]),$($Matches[2]),$($Matches[3]),$($Matches[4])"
}

# Locate vcvarsall.bat (Visual Studio 2022/2026 Community/Professional/BuildTools).
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$vcvars = $null
if (Test-Path $vswhere) {
    $installPath = & $vswhere -latest -prerelease -products '*' -property installationPath 2>$null | Select-Object -First 1
    if ($installPath) { $candidate = Join-Path $installPath 'VC\Auxiliary\Build\vcvarsall.bat'; if (Test-Path $candidate) { $vcvars = $candidate } }
}
if (!$vcvars) {
    foreach ($guess in @(
        "${env:ProgramFiles}\Microsoft Visual Studio\18\Community\VC\Auxiliary\Build\vcvarsall.bat",
        "${env:ProgramFiles}\Microsoft Visual Studio\2022\Community\VC\Auxiliary\Build\vcvarsall.bat"
    )) { if (Test-Path $guess) { $vcvars = $guess; break } }
}
if (!$vcvars) { throw 'vcvarsall.bat não encontrado. Instale o Visual Studio com o workload Desktop C++.' }

$src = Join-Path $root 'src'
$vendor = Join-Path $root 'vendor'
$res = Join-Path $root 'resources'
$exe = Join-Path $OutDir 'Plugnex.exe'
$rcFile = Join-Path $res 'app.rc'
$resFile = Join-Path $OutDir 'app.res'

$ed25519Sources = @('sha512.c','fe.c','ge.c','sc.c','verify.c') | ForEach-Object { '"' + (Join-Path $vendor "ed25519\$_") + '"' }

$major,$minor,$patch,$buildRaw = $numeric.Split(',')
# Strip leading zeros before handing numbers to the C preprocessor: a
# bare "0004" is parsed as an octal literal by cl.exe/rc.exe, which is
# only numerically harmless here because 0-4 happen to all be valid
# octal digits -- any build number containing 8 or 9 would silently
# misparse. [int] parsing here is decimal regardless of leading zeros.
$build = [int]$buildRaw
$versionDisplay = "$([int]$major).$([int]$minor).$([int]$patch).$build"
$defines = "/D PLUGNEX_ORIGIN_HOST=L\`"$($Origin.Host)\`" /D PLUGNEX_ORIGIN_PORT=$($Origin.Port) /D PLUGNEX_ORIGIN_TLS=$(if($Origin.Scheme -eq 'https'){'true'}else{'false'})"
$rcDefines = "/D PLUGNEX_VER_MAJOR=$([int]$major) /D PLUGNEX_VER_MINOR=$([int]$minor) /D PLUGNEX_VER_PATCH=$([int]$patch) /D PLUGNEX_VER_BUILD=$build /D PLUGNEX_VER_STRING=\`"$versionDisplay\`""

$cmd = @"
call "$vcvars" x64 >nul
if errorlevel 1 exit /b 1
rc.exe $rcDefines /fo "$resFile" "$rcFile"
if errorlevel 1 exit /b 1
cl.exe /std:c++17 /EHsc /O2 /W4 /nologo $defines /DUNICODE /D_UNICODE "$(Join-Path $src 'main.cpp')" $($ed25519Sources -join ' ') "$resFile" bcrypt.lib crypt32.lib shell32.lib ole32.lib shlwapi.lib comdlg32.lib ws2_32.lib winhttp.lib user32.lib gdi32.lib /Fe:"$exe" /Fo:"$OutDir\\"
"@

$batch = Join-Path $OutDir 'build.bat'
Set-Content -LiteralPath $batch -Value $cmd -Encoding ascii
$process = Start-Process -FilePath cmd.exe -ArgumentList ('/c "' + $batch + '"') -WorkingDirectory $res -NoNewWindow -PassThru -Wait
if ($process.ExitCode -ne 0) { throw "Falha ao compilar Plugnex.exe (exit $($process.ExitCode))." }
if (!(Test-Path $exe)) { throw 'Build concluído sem erros, mas Plugnex.exe não foi encontrado.' }
Get-Item $exe | Select-Object FullName, Length, LastWriteTime
