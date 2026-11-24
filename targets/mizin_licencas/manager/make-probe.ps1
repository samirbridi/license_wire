param([Parameter(Mandatory)][string]$OutputPath)
$ErrorActionPreference = 'Stop'

# Gerar um projeto Wire .wire válido com todos os nós necessários para o efeito Mizin
$templateFile = Join-Path $env:ProgramFiles 'Resolume Wire\Templates/Video/Video Effect.wire'
$template = Get-Content -LiteralPath $templateFile -Raw | ConvertFrom-Json
$p = $template.patch

$nodes = [ordered]@{}
$nodes['0'] = $p.nodes.'0'   # Texture In (existe no template)
$nodes['1'] = $p.nodes.'12'  # Texture Out (existe no template)

# Node 2: OSC In
$nodes['2'] = @{
    attributes = @{ flow = @{ type = 'flow'; value = 'signal' }; instances = @{ type = 'integer'; value = 1 } }
    bounds = @{ height = 82; width = 130; x = 230.00; y = 0.00 }
    class = @{ id = '77697265-6489-4B7E-A024-A50A1F4C47E4'; version = 1 }  # OSC In
    clock = 'video'
    color = 'ffff6a00'
    constants = @{ input = @{ type = 'osc'; value = $null } }
    hidden = @('instances', 'flow')
    name = 'OSC In'
    thumbnail_visible = $true
}

# Node 3: Read OSC
$nodes['3'] = @{
    attributes = @{ flow = @{ type = 'flow'; value = 'signal' }; instances = @{ type = 'integer'; value = 1 } }
    bounds = @{ height = 82; width = 130; x = 470.00; y = 0.00 }
    class = @{ id = '77697265-48C4-40C4-A756-81D6711CD472'; version = 1 }  # Read OSC
    clock = 'video'
    color = 'ffff6a00'
    constants = @{ address = @{ type = 'string'; value = '/mizin/wire/outliner/wire-preview-1' }; osc = @{ type = 'osc'; value = $null } }
    hidden = @('instances', 'flow')
    name = 'Read OSC'
    thumbnail_visible = $true
}

# Node 4: Attack Release
$nodes['4'] = @{
    attributes = @{ flow = @{ type = 'flow'; value = 'signal' }; instances = @{ type = 'integer'; value = 1 } }
    bounds = @{ height = 82; width = 130; x = 710.00; y = 0.00 }
    class = @{ id = '77697265-D980-43B3-9237-6683B154A5B0'; version = 1 }  # Attack Release
    clock = 'video'
    color = 'ffff6a00'
    constants = @{
        'attack-time' = @{ type = 'float'; value = 0 }
        linear = @{ type = 'bool'; value = $true }
        'release-time' = @{ type = 'float'; value = 5 }
        'restart-at-zero' = @{ type = 'bool'; value = $true }
    }
    hidden = @('instances', 'flow')
    name = 'Attack Release'
    thumbnail_visible = $true
}

# Node 5: Less
$nodes['5'] = @{
    attributes = @{ flow = @{ type = 'flow'; value = 'signal' }; instances = @{ type = 'integer'; value = 1 } }
    bounds = @{ height = 82; width = 130; x = 950.00; y = 0.00 }
    class = @{ id = '77697265-1687-4E44-AFDB-302B2EE936B3'; version = 1 }  # Less
    clock = 'video'
    color = 'ffff6a00'
    constants = @{ input1 = @{ type = 'float'; value = 0 }; input2 = @{ type = 'float'; value = 0 } }
    hidden = @('instances', 'flow')
    name = 'Less'
    thumbnail_visible = $true
}

# Node 6: Text Render
$nodes['6'] = @{
    attributes = @{ flow = @{ type = 'flow'; value = 'signal' }; instances = @{ type = 'integer'; value = 1 } }
    bounds = @{ height = 82; width = 130; x = 470.00; y = 250.00 }
    class = @{ id = '77697265-E2EC-4F1B-901A-CEFC474D3C07'; version = 1 }  # Text Render
    clock = 'video'
    color = 'ffff6a00'
    constants = @{ address = @{ type = 'string'; value = 'MIZIN DEMO' }; material = @{ type = 'color'; value = @(1,1,1,1) }; 'outlinewidth' = @{ type = 'float'; value = 0.02 }; scale = @{ type = 'float'; value = 1.8 } }
    hidden = @('instances', 'flow')
    name = 'Text Render'
    thumbnail_visible = $true
}

# Node 7: Video Mixer
$nodes['7'] = @{
    attributes = @{ flow = @{ type = 'flow'; value = 'signal' }; instances = @{ type = 'integer'; value = 1 } }
    bounds = @{ height = 82; width = 130; x = 950.00; y = 250.00 }
    class = @{ id = '77697265-A270-4D60-911C-A88B1BE6369A'; version = 1 }  # Video Mixer
    clock = 'video'
    color = 'ffff6a00'
    constants = @{ bypass = @{ type = 'bool'; value = $false }; input1 = @{ type = 'texture2d'; value = $null }; input2 = @{ type = 'texture2d'; value = $null }; mode = @{ type = 'integer'; value = 11 }; opacity1 = @{ type = 'float'; value = 0.88 }; opacity2 = @{ type = 'float'; value = 0.456 } }
    hidden = @('instances', 'flow')
    name = 'Video Mixer'
    thumbnail_visible = $true
}

$connections = @(
    @{ from = @(2,'output'); to = @(3,'osc') }
    @{ from = @(3,'on-read'); to = @(4,'trigger') }
    @{ from = @(4,'output'); to = @(5,'input0') }
    @{ from = @(5,'output0'); to = @(7,'opacity2') }
    @{ from = @(0,'output'); to = @(7,'input1') }
    @{ from = @(6,'output'); to = @(7,'input2') }
    @{ from = @(7,'output'); to = @(1,'input') }
)

$patch = @{
    connections = $connections
    inputOrder = @(0)
    meta = @{
        author = 'Mizin'
        category = 'effect'
        description = 'Efeito de homologação do gerenciador Mizin.'
        displayName = 'Mizin Wire • Teste de ativação'
        identifier = 'c792fbec-b7ae-4219-8f65-abf594803692'
        licenseName = ''
        mail = ''
        vendor = ''
    }
    nextNodeId = 8
    nodes = $nodes
}

$document = @{
    formatVersion = @{ major = 1; minor = 1; patch = 0 }
    patch = $patch
    resources = @()
}

$document | ConvertTo-Json -Depth 50 | Set-Content -LiteralPath $OutputPath -Encoding utf8
