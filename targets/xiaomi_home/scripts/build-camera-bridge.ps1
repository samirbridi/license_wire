param([string]$RunId=('bridge-'+[guid]::NewGuid().ToString('N')))
$ErrorActionPreference='Stop'
$target=(Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$releaseText=& node.exe (Join-Path $PSScriptRoot 'version-build.mjs') --build --run-id $RunId
if($LASTEXITCODE -ne 0){throw 'O build automatico falhou.'}
$release=$releaseText|ConvertFrom-Json
$artifact=Join-Path $target ($release.artifact+'/bridge')
if(Test-Path -LiteralPath $artifact){throw 'Os artefatos da ponte ja existem; use um novo RunId.'}
New-Item -ItemType Directory -Path $artifact|Out-Null
$source=Join-Path $target ('runtime/bridge-source-'+$release.build)
$pristine=Join-Path $target 'runtime/go-readonly-modules/github.com/!alexx!i!t/go2rtc@v1.9.15'
if(Test-Path -LiteralPath $source){throw 'Diretorio de compilacao ja existe.'}
Copy-Item -LiteralPath $pristine -Destination $source -Recurse
$patch=Join-Path $target 'reconstructed/go2rtc-miss-patch'
foreach($file in (Get-ChildItem -LiteralPath (Join-Path $patch 'internal'),(Join-Path $patch 'pkg') -Recurse -File)){
 $relative=$file.FullName.Substring($patch.Length+1);$destination=Join-Path $source $relative
 if(Test-Path -LiteralPath $destination){(Get-Item -LiteralPath $destination).IsReadOnly=$false}
 Copy-Item -LiteralPath $file.FullName -Destination $destination -Force
}
$vars=@('GOPATH','GOMODCACHE','GOCACHE','GOTOOLCHAIN','CGO_ENABLED','GOMAXPROCS','GOOS','GOARCH')
$saved=@{};foreach($name in $vars){$saved[$name]=[Environment]::GetEnvironmentVariable($name,'Process')}
$compiler=Join-Path $target 'runtime/toolchains/go1.27.3/go/bin/go.exe'
$receipt=[ordered]@{version=$release.version;sourceCommit=$release.sourceCommit;upstream='github.com/AlexxIT/go2rtc@v1.9.15';pass=$false;files=@()}
try{
 $env:GOPATH=Join-Path $target 'runtime/go-work'
 $env:GOMODCACHE=Join-Path $target 'runtime/go-readonly-modules'
 $env:GOCACHE=Join-Path $target 'runtime/go-bridge-build-cache'
 $env:GOTOOLCHAIN='local';$env:CGO_ENABLED='0';$env:GOMAXPROCS='2';$env:GOOS='windows';$env:GOARCH='amd64'
 Push-Location $source
 try{
  & $compiler test ./pkg/xiaomi/miss/... ./internal/xiaomi
  if($LASTEXITCODE -ne 0){throw 'Teste da ponte falhou.'}
  & $compiler mod verify
  if($LASTEXITCODE -ne 0){throw 'Dependencias modificadas ou invalidas.'}
  foreach($platform in @('windows','linux')){
   $env:GOOS=$platform;$name=if($platform -eq 'windows'){'go2rtc-windows-amd64.exe'}else{'go2rtc-linux-amd64'}
   $output=Join-Path $artifact $name
   & $compiler build -trimpath -o $output .
   if($LASTEXITCODE -ne 0){throw ('Compilacao falhou: '+$platform)}
   $receipt.files+=@{platform=$platform;arch='amd64';file=$name;sha256=(Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash.ToLowerInvariant()}
  }
  Copy-Item -LiteralPath (Join-Path $source 'LICENSE') -Destination (Join-Path $artifact 'LICENSE-go2rtc')
  $receipt.pass=$true
 }finally{Pop-Location}
}finally{
 foreach($name in $vars){[Environment]::SetEnvironmentVariable($name,$saved[$name],'Process')}
 [IO.File]::WriteAllText((Join-Path $target ('evidence/builds/'+$RunId+'-bridge.json')),($receipt|ConvertTo-Json -Depth 6),(New-Object Text.UTF8Encoding $false))
}
$receipt|ConvertTo-Json -Depth 6
