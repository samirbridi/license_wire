param([string]$RunId = ('readonly-' + [guid]::NewGuid().ToString('N')))
$ErrorActionPreference = 'Stop'
$probeTarget = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$probeToolMetadata = Get-Content -Raw -LiteralPath (Join-Path $probeTarget 'runtime/toolchains/go-download-metadata.json') | ConvertFrom-Json
$probeCompiler = Join-Path $probeTarget ('runtime/toolchains/' + $probeToolMetadata.version + '/go/bin/go.exe')
if (-not (Test-Path -LiteralPath $probeCompiler)) { throw 'Compilador Go oficial preparado nao encontrado.' }
$probeStateText = & node.exe (Join-Path $PSScriptRoot 'version-build.mjs') --build --run-id $RunId
if ($LASTEXITCODE -ne 0) { throw 'A reserva automatica do build falhou.' }
$probeState = $probeStateText | ConvertFrom-Json
$probeArtifact = Join-Path $probeTarget ($probeState.artifact + '/diagnostics')
$probeBinary = Join-Path $probeArtifact 'xiaomi-readonly.exe'
$probeReceiptPath = Join-Path $probeTarget ('evidence/builds/' + $RunId + '-readonly.json')
if (Test-Path -LiteralPath $probeReceiptPath) {
    $probePrior = Get-Content -Raw -LiteralPath $probeReceiptPath | ConvertFrom-Json
    if ($probePrior.pass -and (Test-Path -LiteralPath $probeBinary) -and (Get-FileHash -LiteralPath $probeBinary -Algorithm SHA256).Hash.ToLowerInvariant() -eq $probePrior.sha256) { $probePrior | ConvertTo-Json; return }
    throw 'Tentativa anterior reservada. Use outro RunId; nao reutilize numero de compilacao.'
}
if (Test-Path -LiteralPath $probeBinary) { throw 'O artefato do diagnostico ja existe; nao sera sobrescrito.' }
New-Item -ItemType Directory -Path $probeArtifact -Force | Out-Null
$probeVars = @('GOPATH','GOMODCACHE','GOCACHE','GOTOOLCHAIN','CGO_ENABLED','GOMAXPROCS')
$probeSaved = @{}
foreach ($name in $probeVars) { $probeSaved[$name] = [Environment]::GetEnvironmentVariable($name,'Process') }
$probeReceipt = [ordered]@{version=$probeState.version;sourceCommit=$probeState.sourceCommit;component='read-only-camera-diagnostic';pass=$false;hardwareTested=$false;sha256=$null}
try {
    $env:GOPATH = Join-Path $probeTarget 'runtime/go-work'
    $env:GOMODCACHE = Join-Path $probeTarget 'runtime/go-modules'
    $env:GOCACHE = Join-Path $probeTarget 'runtime/go-build-cache'
    $env:GOTOOLCHAIN = 'local'
    $env:CGO_ENABLED = '0'
    $env:GOMAXPROCS = '2'
    Push-Location (Join-Path $probeTarget 'reconstructed/xiaomi-readonly')
    try {
        & $probeCompiler test ./...
        if ($LASTEXITCODE -ne 0) { throw 'Os testes do diagnostico falharam.' }
        & $probeCompiler build -trimpath -ldflags ('-X main.sourceCommit=' + $probeState.sourceCommit) -o $probeBinary .
        if ($LASTEXITCODE -ne 0) { throw 'A compilacao do diagnostico falhou.' }
        $probeReceipt.pass = $true
        $probeReceipt.sha256 = (Get-FileHash -LiteralPath $probeBinary -Algorithm SHA256).Hash.ToLowerInvariant()
    } finally { Pop-Location }
} finally {
    foreach ($name in $probeVars) { [Environment]::SetEnvironmentVariable($name,$probeSaved[$name],'Process') }
    [IO.File]::WriteAllText($probeReceiptPath, ($probeReceipt | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
}
$probeReceipt | ConvertTo-Json
