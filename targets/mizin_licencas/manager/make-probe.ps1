param([Parameter(Mandatory)][string]$OutputPath)
$ErrorActionPreference = 'Stop'
$wireRoot = Join-Path $env:ProgramFiles 'Resolume Wire'
$docs = Join-Path $wireRoot 'Documentation/Nodes'
function Read-ExampleNode($name) {
    $file = Get-ChildItem "$docs/* - $name/*.wire" | Select-Object -First 1
    $example = Get-Content -LiteralPath $file.FullName -Raw | ConvertFrom-Json -AsHashtable
    return ($example.patch.nodes.Values | Where-Object { $_.name -eq $name } | Select-Object -First 1)
}
$template = Get-Content (Join-Path $wireRoot 'Templates/Video/Video Effect.wire') -Raw | ConvertFrom-Json -AsHashtable
$p = $template.patch
$nodes = [ordered]@{'0'=$p.nodes['0'];'1'=$p.nodes['12']}
$names = 'OSC In','Read OSC','Attack Release','Less','Text Render','Video Mixer'
for ($i=0;$i -lt $names.Count;$i++) {
    $nodes[[string]($i+2)] = Read-ExampleNode $names[$i]
}
$p.meta.displayName = 'Mizin Wire • Teste de ativação'
$p.meta.identifier = 'c792fbec-b7ae-4219-8f65-abf594803692'
$p.meta.author = 'Mizin'
$p.meta.description = 'Efeito de homologação do gerenciador. A saída sobrepõe MIZIN DEMO na ausência de pulsos.'
$nodes['3'].constants.address.value = '/mizin/wire/outliner/wire-preview-1'
$nodes['4'].constants.'attack-time'.value = 0
$nodes['4'].constants.'release-time'.value = 5
$nodes['4'].constants.linear.value = $true
$nodes['5'].constants.input1.value = 0.05
$nodes['6'].constants.input.value = 'MIZIN DEMO'
$nodes['6'].constants.scale.value = 1.8
$nodes['6'].constants.material.value = @(1,1,1,1)
$nodes['6'].constants.outlinewidth.value = 0.02
$nodes['6'].constants.outlinecolor.value = @(0,0,0,1)
$nodes['7'].constants.mode.value = 11
$nodes['7'].constants.opacity1.value = 1
$nodes['7'].constants.opacity2.value = 1
$p.nodes = $nodes
$p.nextNodeId = 8
$p.inputOrder = @(0)
$p.ui.selection = @()
$p.connections = @(
    @{from=@(2,'output');to=@(3,'osc')}
    @{from=@(3,'on-read');to=@(4,'trigger')}
    @{from=@(4,'output');to=@(5,'input0')}
    @{from=@(5,'output0');to=@(7,'opacity2')}
    @{from=@(0,'output');to=@(7,'input1')}
    @{from=@(6,'output');to=@(7,'input2')}
    @{from=@(7,'output');to=@(1,'input')}
)
foreach ($index in 0..7) {
    $node=$nodes[[string]$index]
    $node.bounds.x=230*($index%4)
    $node.bounds.y=250*[math]::Floor($index/4)
}
$template | ConvertTo-Json -Depth 40 | Set-Content -LiteralPath $OutputPath -Encoding utf8
