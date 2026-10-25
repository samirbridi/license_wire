<#
Aplica ou remove SOMENTE a regra UDP deste diagnostico.
Requer administrador Windows. Nao desativa firewall nem altera perfil de rede.
O executavel deve ser o go2rtc deste alvo e os destinos sao os seis IPs
do inventario privado autorizado pelo proprietario.
#>
param([switch]$Remove)
$ErrorActionPreference = 'Stop'
$targetRoot = Split-Path -Parent $PSScriptRoot
$privateRoot = Join-Path $targetRoot 'evidence/private'
$receiptPath = Join-Path $privateRoot 'firewall-diagnostic-rule.json'
$ruleName = 'Codex-Xiaomi-Local-Diagnostic-UDP'
$programPath = Join-Path $targetRoot 'runtime/go2rtc-v1.9.15/go2rtc.exe'
$receipt = [ordered]@{name=$ruleName;success=$false;action=$(if ($Remove) {'remove'} else {'allow'});time_utc=[DateTime]::UtcNow.ToString('o')}
try {
    $principal = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent())
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw 'Administrador Windows necessario para esta regra.'
    }
    if (-not (Test-Path -LiteralPath $programPath -PathType Leaf)) { throw 'Executavel do alvo nao encontrado.' }
    $existing = Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
    if ($Remove) {
        if ($existing) {
            $programFilter = $existing | Get-NetFirewallApplicationFilter
            if ($programFilter.Program -ne $programPath) { throw 'A regra existente aponta para outro executavel; nao foi removida.' }
            $existing | Remove-NetFirewallRule
        }
    } else {
        if ($existing) { throw 'Regra ja existe. Nao foi sobrescrita.' }
        $scope = Get-Content -LiteralPath (Join-Path $privateRoot 'firewall-scope.json') -Raw | ConvertFrom-Json
        $connectionProfile = Get-NetConnectionProfile -InterfaceAlias $scope.interfaceAlias
        if ($connectionProfile.NetworkCategory -ne 'Private') { throw 'Ethernet nao esta em perfil privado. Nenhum perfil foi alterado.' }
        $localAddress = [string]$scope.localAddress
        $localAddresses = Get-NetIPAddress -InterfaceAlias $scope.interfaceAlias -AddressFamily IPv4
        if ($localAddress -notin $localAddresses.IPAddress) { throw 'IP local mudou. Nenhuma regra foi criada.' }
        $inventory = Get-Content -LiteralPath (Join-Path $privateRoot 'camera-sources-cn.json') -Raw | ConvertFrom-Json
        $addresses = @($inventory.sources | ForEach-Object { ([uri]$_.url).Host } | Sort-Object -Unique)
        if ($addresses.Count -ne 6 -or ($addresses | Where-Object { -not $_.StartsWith([string]$scope.cameraPrefix) -or $_ -notmatch '^\d{1,3}(\.\d{1,3}){3}$' })) {
            throw 'Enderecos diferentes do inventario esperado. Nenhuma regra foi criada.'
        }
        New-NetFirewallRule -Name $ruleName -DisplayName 'Xiaomi cameras - local go2rtc UDP diagnostic' `
            -Description 'Alvo xiaomi_home: somente go2rtc, seis IPs de cameras, Ethernet privada. API em loopback.' `
            -Direction Inbound -Action Allow -Enabled True -Profile Private -Protocol UDP `
            -Program $programPath -LocalAddress $localAddress -RemoteAddress $addresses `
            -InterfaceAlias $scope.interfaceAlias -EdgeTraversalPolicy Block | Out-Null
        $receipt.program = $programPath
        $receipt.remote_count = $addresses.Count
        $receipt.profile = 'Private'
        $receipt.protocol = 'UDP'
    }
    $receipt.success = $true
} catch {
    $receipt.error = $_.Exception.Message
} finally {
    $receipt | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $receiptPath -Encoding utf8
}
if (-not $receipt.success) { exit 1 }
