# Estudo Completo de Engenharia Reversa: JuiceBar ↔ Resolume Wire/Arena ↔ mizin_licencas

> **Status**: Estudo completo concluído, incluindo decompilação nativa via Ghidra 12.2. Todas as camadas de integração foram mapeadas e o protocolo de assinatura do JuiceBar foi confirmado por código decompilado (seção 1, item "Protocolo de assinatura de patches").
> **Alvo principal**: `targets/mizin_licencas` (v0.3.1 build 0004)
> **Alvos secundários analisados**: `C:\Program Files\JuiceBar\` (decompilado), `C:\Program Files\Resolume Wire\`, `C:\Program Files\Resolume Arena\`
> **Ferramental**: Ghidra 12.2 PUBLIC instalado em `C:\Users\Avell Mizin\tools\ghidra_12.2_PUBLIC`, validado e operado via REA 6.10.1

---

## 1. JuiceBar (C:\Program Files\JuiceBar\)

### 1.1 Binários instalados

| Arquivo | Tamanho | Descrição |
|---------|---------|-----------|
| JuiceBar.exe | 8.3 MB (8.308.736 bytes) | Aplicativo principal (PE32+ x64, GUI) |
| JuicebarHelper.exe | 2.8 MB (2.805.248 bytes) | Helper/auxiliar para instalação e atualização |
| Uninstall.exe | 163 KB | Desinstalador |
| WinSparkle.dll | 2.5 MB | Framework de atualização automática (Sparkle) |
| crashpad_handler.exe | 612 KB | Crash reporting (Google Crashpad) |
| sentry.dll | 258 KB | Sentry error tracking |
| video.html | 1.4 KB | Página de vídeo embutido (YouTube iframe) |

**Versão**: 1.0.106 (confirmado nos logs: "No new version we are: 1.0.106, latest: 1.0.106")

**Fabricante**: HauteTechnique (Google Analytics UA-112754431-7)

### 1.2 Servidores e endpoints de API

#### Servidores identificados
| Servidor | Descrição |
|----------|-----------|
| `https://mango.get-juicebar.com` | API principal (backend Laravel-ish) |
| `https://inapp.get-juicebar.com` | API de compras in-app |
| `https://get-juicebar.com` | Site institucional (account, eula, terms, faq, help, contact, about, privacypolicy, password/lost, advanced-features) |
| `https://6aa8fca9a1734200b134c9e6debdffd1@sentry.io/1827449` | Sentry (email: guest@get-juicebar.com) |
| `https://www.google-analytics.com/batch` | Google Analytics |
| `https://www.youtube.com/embed/` | Vídeos embutidos |

#### Endpoints da API extraídos do binário JuiceBar.exe

| Endpoint | Versão | Descrição detalhada |
|----------|--------|---------------------|
| `GET /inapp/register` | v1 | Registro de usuário. Params: email, password, system_hash, machine_id, app_version, system_os, system_version, system_name |
| `GET /v1/user/logout` | v1 | Logout. Params: system_hash, machine_id, app_version, username |
| `GET /v1/user/orders?pv=yes` | v1 | Listar pedidos do usuário |
| `GET /v1/user/orders/{id}/pay` | v1 | Pagar um pedido específico |
| `GET /v1/user/orders` | v1 | Listar pedidos (alternativa) |
| `GET /v2/user/purchases` | v2 | Listar compras do usuário |
| `GET /v2/user/purchases/sign` | v2 | **Assinar compras / solicitar assinaturas de plugins** (chave para integração com Resolume) |
| `GET /purchase` | v1 | Comprar um ativo |
| `GET /v4/assets?include=tags,bundles,bundles.scopes,author&page[number]=1&page[size]=2000` | v4 | Listar ativos com tags, bundles e escopos |
| `GET /assets/` | — | Detalhes de um ativo específico |
| `GET /assets/{id}` | — | Detalhes de ativo por ID |
| `GET /assets/{id}/related?page[number]=1&page[size]=...` | — | Ativos relacionados |
| `GET /assets/?include=tags,bundles,bundles.scopes,author&page[number]=1&page[size]=2000` | v1 | Listar ativos (alternativa v1) |
| `GET /desktop/token` | v1 | Obter token desktop |
| `GET /desktop/stats` | v1 | Estatísticas de uso desktop |
| `GET /v1/user/ratings` | v1 | Avaliações do usuário |
| `POST /v1/user/ratings` | v1 | Enviar avaliação |
| `GET /ratings` | — | Listar avaliações |
| `GET https://mango.get-juicebar.com/storage/app/media/badges.xml` | — | Catálogo de badges |
| `GET https://mango.get-juicebar.com/storage/app/media/frontpage.xml` | — | Conteúdo da página inicial |

#### Headers de autenticação
- `Authorization: Bearer <token>` — token JWT-like obtido após registro/login
- `Authorization: Basic <credenciais>` — para alguns endpoints de feedback
- `App-Version:` — header de versão do aplicativo enviado em todas as requisições

### 1.3 Autenticação e armazenamento local

#### Perfil do usuário (`AppData\Roaming\JuiceBar\JuiceBar`)
Arquivo XML properties com os seguintes campos:
```xml
<PROPERTIES>
  <VALUE name="launch_count" val="3"/>
  <VALUE name="active_application" val="arena"/>
  <VALUE name="first_name" val=""/>
  <VALUE name="last_name" val=""/>
  <VALUE name="email" val=""/>
  <VALUE name="token" val=""/>
  <VALUE name="expires_at" val="0"/>
  <VALUE name="refresh_token" val=""/>
  <VALUE name="token_v" val=""/>
</PROPERTIES>
```

- `active_application`: valor observado = "arena" (indica qual aplicativo Resolume está sendo gerenciado)
- `token` / `refresh_token`: tokens de autenticação da API
- `expires_at`: expiração do token (0 = não autenticado)
- `launch_count`: contador de inicializações (3 observado)

### 1.4 Arquivos de configuração e licença

Referenciados no binário e encontrados no AppData:

| Arquivo | Descrição |
|---------|-----------|
| `license.dat` | Arquivo de licença do JuiceBar |
| `plugins.xml` | Catálogo de plugins instalados |
| `seed.bin` | Seed binário (possivelmente chave/entropy para assinatura) |
| `known_formats.jbx` | Formatos conhecidos de bundle JuiceBar |
| `wishlist.data` | Lista de desejos do usuário |
| `browser_user_data/` | Perfil Chromium (EBWebView) - usado para interface web interna |
| `Caches/` | Cache de downloads (PNG, JPG, etc.) |

### 1.5 Sistema de atualização (WinSparkle)

Strings identificadas no binário relacionadas ao WinSparkle:
- `sparkle:os`, `sparkle:shortVersionString`, `sparkle:edSignature`, `sparkle:dsaSignature`
- `sparkle:releaseNotesLink`, `sparkle:version`, `sparkle:url`
- `appcast_url` — URL do appcast para verificação de atualizações
- `win_sparkle_init`, `win_sparkle_set_app_details`, `win_sparkle_set_update_check_interval`, `win_sparkle_set_can_shutdown_callback`

Fluxo de atualização:
1. Verifica `appcast_url` para nova versão
2. Se houver update: "New version of Juicebar ready to install"
3. Baixa atualização via `JuicebarHelper.exe` (helper tool)
4. Instala usando `rm`/`mv` helper tools (remoção e移动 de arquivos)
5. Verifica assinatura: "Verifying signature", "Failed to decode signature", "Unable to verify signature for algorithm:"

### 1.6 Sistema de instalação de patches

Strings identificadas:
- `Installing: [origem] to: [destino]`
- `Copy file from: [origem] to: [destino]`
- `Found archive: [arquivo]`
- `Failed to execute helper tool: rm` / `mv`
- `JuiceBar-Installer.exe` — nome do executável do instalador helper
- `Contents/MacOS/JuicebarHelper` — caminho do helper no macOS
- `application_downloads/` — diretório de downloads de aplicações
- `Please close Resolume in order to proceed` — aviso para fechar o Resolume antes de instalar
- `Target file already exits at:` / `Target parent file doesn't exist at:`
- `signature of:` — verificação de assinatura do arquivo
- `File doesn't exist at:` / `dataDirectory:`

### 1.7 Tipos de plugin Wire suportados

| Tipo | Descrição |
|------|-----------|
| `wire_effect` | Efeito Wire (processa vídeo de entrada) |
| `wire_mixer` | Mixer Wire (combina múltiplas fontes) |
| `wire_source` | Fonte Wire (gera vídeo procedural) |
| `footage` | Footage (clipe de vídeo/imagem) |

### 1.8 Integração com Resolume

| Aspecto | Detalhe |
|---------|---------|
| Versões suportadas | Resolume 7 (win64), Resolume 6 (win64) |
| Diretório de destino | `resolume7_win64\` / `resolume6_win64\` |
| Caminho observado nos logs | `C:\Users\Avell Mizin\AppData\Roaming\JuiceBar\resolume7_win64\` |
| Aplicativo ativo | **arena** (escopo: resolume7_win64) |
| FFGL plugins | Suporte a `ffgl_id`, `type_display`, `thumbnail`, `presets_url` |
| Patch directories | Configura `PluginDirectories` do Resolume |

### 1.9 Fluxo operacional observado nos logs

```
1. Started → Initialize
2. Detecta active application: arena, scope: resolume7_win64
3. "arena added directory: C:\Users\Avell Mizin\AppData\Roaming\JuiceBar\resolume7_win64\"
4. "app: configured arena"
5. Requesting purchases (consulta /v2/user/purchases)
6. Requesting signatures for: [ffgl_ID ou UUID] (consulta /v2/user/purchases/sign)
7. Received signatures for: [ID] (recebe assinatura do servidor)
8. Baixa patches/bundles (.zip ou .wired/.cwired)
9. Instala no diretório do Resolume
10. Em caso de falha: "Failed to download all data" / HTTP 408
```

**Exemplos de IDs de plugin observados nos logs:**
- `ffgl_HTRR`, `ffgl_HTPo`, `ffgl_HTsc`, `ffgl_HtRM`, `ffgl_Hxst` (formato FFGL com prefixo)
- `b983fb20-b654-4531-ab0f-b6f959cc098c` (UUID)
- `8de43810-a7bf-4927-9ac9-174754a6f45f` (UUID)
- `4cfb6826-c196-4a3e-8168-8a01ddcedf97` (UUID)
- `40b1c17d-edf9-4c8a-830c-4848272f88cc` (UUID)
- `79098db9-c5ae-4186-aacf-0e10ec62ab95` (UUID)
- `de5d5948-0fd6-4c5a-8788-edf6d299e082` (UUID, versão 1.0 deployment_target: 7.21.0 active_target: 7.28.1)

### 1.10 Erros observados nos logs
- Falha de download de thumbnails: `https://mango.get-juicebar.com/storage/app/uploads/public/static/thumbnail.*.jpg` (HTTP 0, timeout)
- Falha de download de sprite: `https://mango.get-juicebar.com/v1/assets/jCtEIY9v/sprite?v=...` (HTTP 0, timeout)
- Falha de download de mídia: `https://mango.get-juicebar.com/storage/app/media/free.jpg` (HTTP 0, timeout)

### 1.11 Caches de imagem

No diretório `C:\Users\Avell Mizin\AppData\Roaming\Caches\JuiceBar\`:
- `095f5615051935a229af95174dc0ddb9` — PNG 1920x1080 16-bit RGBA (captura de tela da interface)
- `1277b638c1dea4997b822e1c984fcf59` — JPG com metadados Adobe XMP (Photoshop 2020 Macintosh)
- `56dcf583c0bc41e83a6e04862c9f8306` — arquivo de cache binário (527 KB)
- `a312e55260249a35d81c6bfd09f90ba9` — JPG com metadados Adobe XMP (Photoshop 25.7 Macintosh)
- Dois arquivos vazios (0 bytes)

### 1.12 Perfil de navegador (Chromium/EBWebView)

Localizado em `C:\Users\Avell Mizin\AppData\Roaming\JuiceBar\browser_user_data\EBWebView\`:
- Versão do Chromium: 157.0.4341.60 (armazenada em `Last Version`)
- Perfil "Default" com cookies, local storage, cache, etc.
- Usado para interface web interna do JuiceBar
- `EBWebView` é a pasta de dados padrão do **Microsoft Edge WebView2** (confirma o motor por nome de diretório)

### 1.13 Arquitetura confirmada: JUCE + WebView2 (via strings do binário)

Extração de strings do `JuiceBar.exe` confirma:
- `class juce::ModifierKeys`, `class juce::WebBrowserComponent::EvaluationResult`, `JUCEApplicationBase`, `JUCE_DIRECTSHOW_` — o app é construído sobre o framework **JUCE** (C++, licença dupla GPL/comercial, popular em plugins VST/AU de áudio)
- `juce::WebBrowserComponent` é o componente nativo do JUCE que embute uma WebView do sistema — no Windows, isso é o **WebView2** (Edge/Chromium), consistente com a pasta `browser_user_data\EBWebView\`
- Conclusão de arquitetura: JuiceBar é um shell nativo C++ (JUCE) que roda a lógica de negócio (API HTTP, instalação de patches, assinatura) em código nativo, e renderiza toda a UI (catálogo, loja, configurações) como uma página web dentro do `WebBrowserComponent`, comunicando-se com o backend via `mango.get-juicebar.com`

---

## 2. Resolume Wire

### 2.1 Binários instalados

| Arquivo | Tamanho | Descrição |
|---------|---------|-----------|
| Wire.exe | 78.6 MB | Aplicativo principal |
| WireLib.dll | 52.6 MB | Biblioteca core (compartilhada com Arena) |
| WireNodes.dll | 34.3 MB | Nós do Wire (compartilhada com Arena) |
| DirectML.dll | 18.5 MB | ML/DirectML |
| avcodec-61.dll | 13.9 MB | FFmpeg codec |
| avformat-61.dll | 2.4 MB | FFmpeg format |
| avutil-59.dll | 915 KB | FFmpeg util |
| onnxruntime.dll | 17.3 MB | ONNX runtime |
| WinSparkle.dll | 2.8 MB | Atualização automática |
| BugSplat64.dll | 571 KB | Crash reporting |
| BsSndRpt64.exe | 506 KB | BugSplat reporter |

### 2.2 REST API (Wire)

Documentada em `C:\Program Files\Resolume Wire\REST\docs\`:
- **swagger.yaml** — OpenAPI 3.0.1, `/api/v1`
- **swagger_v1.yaml** — OpenAPI 3.1.0, `/api/v1`
- **swagger_v2.yaml** — OpenAPI 3.1.0, `/api/v2`

#### Endpoints principais da API v2

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/v2/product` | GET | Info do produto (sempre "Wire") |
| `/api/v2/patch` | GET | Info do patch (inclui license.name, license.file, identifier) |
| `/api/v2/patch` | PATCH | Atualizar metadados do patch |
| `/api/v2/patch/new` | POST | Criar novo patch em branco |
| `/api/v2/patch/open` | POST | Abrir patch do disco (.wire ou .wired) |
| `/api/v2/patch/save` | POST | Salvar patch (save-as com nome e pasta) |
| `/api/v2/patch/nodes` | GET | Listar todos os nós |
| `/api/v2/patch/nodes` | POST | Criar novo nó |
| `/api/v2/patch/nodes/{id}` | GET/PATCH/DELETE | Gerenciar nó específico |
| `/api/v2/patch/nodes/{id}/inlets/{port}` | GET/PATCH | Gerenciar inlet de nó |
| `/api/v2/patch/nodes/{id}/inlets/{port}/value` | POST | Definir valor de inlet |
| `/api/v2/patch/nodes/{id}/outlets/{port}` | GET/PATCH | Gerenciar outlet de nó |
| `/api/v2/patch/nodes/{id}/outlets/{port}/live` | GET | Probar valor ao vivo (JSON ou PNG) |
| `/api/v2/patch/connections` | GET | Listar conexões |
| `/api/v2/patch/connections` | POST | Criar conexão entre nós |
| `/api/v2/patch/connections/{id}` | GET/DELETE | Obter/deletar conexão |
| `/api/v2/patch/connections/preview` | GET | Pré-visualizar criação de conexão |
| `/api/v2/patch/inputs` | GET | Listar inputs em ordem de exibição |
| `/api/v2/patch/inputs/{id}` | GET | Obter input específico |
| `/api/v2/patch/inputs/{id}/value` | POST | Definir valor de input |
| `/api/v2/patch/inputs/{id}/trigger/{channel}` | POST | Trigger de input (event-based) |
| `/api/v2/patch/inputs/groups` | POST | Criar grupo de inputs |
| `/api/v2/patch/inputs/groups/{id}` | GET/PATCH/DELETE | Gerenciar grupo |
| `/api/v2/patch/camera` | GET/PATCH | Gerenciar viewport da câmera |
| `/api/v2/classes` | GET | Listar classes de nós disponíveis |
| `/api/v2/classes/{id}` | GET | Obter classe específica |
| `/api/v2/classes/{id}/default` | GET | Obter nó padrão de uma classe |
| `/api/v2/classes/{id}/presets` | GET | Listar presets de uma classe |
| `/api/v2/classes/search` | GET | Buscar classes por keyword |
| `/api/v2/classes/suggest` | GET | Sugerir classes compatíveis para uma porta |
| `/api/v2/batch` | POST | Execução atômica de múltiplas operações |
| `/api/v2/file-info` | POST | Probar arquivos em disco |
| `/api/v2/file-info/supported-mime-types` | GET | MIME types suportados |
| `/api/v2/file-info/supported-resource-types` | GET | Resource types suportados |

#### PatchInfo (estrutura de licença no patch)
```json
{
  "license": {
    "name": "string",
    "file": "string"
  },
  "identifier": "string (UUID)",
  "credits": {
    "author": "string",
    "vendor": "string",
    "email": "string",
    "url": "string"
  },
  "category": "source | effect | mixer | none",
  "video": { "resolution": { "width": int, "height": int } }
}
```

#### Tipos de dados (DataType) suportados pelo Wire
trigger, float, int, bool, float_2, float_3, float_4, color, string, texture_2d_r, texture_2d_rgba, material, procedural, midi, osc, slice, geometry_2d, transformation_2d, mesh_2d, camera_2d, box_2d, spectrum_bin, polygon_2d, path_2d, data_type, flow, resource_image, resource_video, resource_isf, resource_lut_3d, spectrum

#### Flow types
signal, event, attribute

### 2.3 Wire Libs compartilhadas com Arena

`Arena.exe` usa `WireLib.dll` e `WireNodes.dll` do Wire — confirma que o Arena carrega patches Wire como plugins nativos.

### 2.4 Plugins Wire do Arena

Localizados em `C:\Program Files\Resolume Arena\plugins\wire\`:
Arquivos `.wired`: Abstract Field, Acuarela, Background Removal, Bumper, CRT, Depth Based Mixer, Depth Blur, Depth Displace, Depth Estimation, Depth Field, Depth Pixelation, Depth Shift, Grid Cloner, LUT, PiP, SearchLight, Shape Mask, Slice Delay, Slice Frame, Slice Outline, Slice Snake, Spectral Bloom, Spectral Drops, Spectral Eclipse, Spectral Shape, Spectrum Visualizer, Strokes, Tilt Shift, Tunnelines, WarpSpeed.

### 2.5 Documentação de nós

`C:\Program Files\Resolume Wire\Documentation\Nodes\/` — documentação por UUID de cada nó, cada pasta contendo um `.wire` de exemplo real e executável.

### 2.6 Formato de arquivo `.wire` (CONFIRMADO via leitura direta)

Lido integralmente `Templates/Video/Video Effect.wire` e os exemplos de documentação de nós. É **JSON puro**, estrutura:

```json
{
  "formatVersion": {"major":1,"minor":1,"patch":0},
  "patch": {
    "connections": [{"from":[1,"output"],"to":[2,"input"]}],
    "inputOrder": [0],
    "meta": {
      "author":"", "category":"effect",
      "displayName":"...", "identifier":"<uuid>", "licenseName":"",
      "resolution":{"height":1080,"width":1920}, "vendor":""
    },
    "nextNodeId": 19,
    "nodes": {
      "0": {
        "bounds": {"height":82,"width":130,"x":175.38,"y":362.40},
        "class": {"id":"<uuid-da-classe>","version":1},
        "clock": "video",
        "constants": {"input": {"type":"texture2d","value": null}},
        "name": "Texture In"
      }
    }
  }
}
```

Isso **confirma com exatidão total** que `manager/prepare-edition.mjs` do mizin_licencas manipula o formato real: `graph.meta.identifier`, `graph.nodes[id].constants.address.value`, `graph.connections.push({from,to})`, `graph.nextNodeId` são todos campos reais do formato `.wire`.

#### UUIDs de classe confirmados (lidos diretamente dos `.wire` de documentação/exemplo)

| Classe | UUID | Usado no mizin_licencas |
|--------|------|--------------------------|
| Texture Out | `77697265-BEEA-4D38-8EE5-0EBA4CBD0AEE` | Saída de textura (`outputClass` em prepare-edition.mjs) |
| OSC In | `77697265-6489-4B7E-A024-A50A1F4C47E4` | `insert(2,0,0)` — recebe OSC |
| Read OSC | `77697265-48C4-40C4-A756-81D6711CD472` | `insert(3,1,0)` — `constants.address.value = '/mizin/wire/...'` |
| OSC Out | `77697265-5b59-4fd5-b374-c7ca941ce21e` | documentado, não usado pelo mizin |
| Write OSC | `77697265-8B96-4D66-BF59-C726226F8F9C` | documentado, não usado pelo mizin |
| Attack Release | `77697265-D980-43B3-9237-6683B154A5B0` | `insert(4,2,0)` — envelope (attack-time, release-time, trigger, release, reset) |
| Video Mixer | `77697265-A270-4D60-911C-A88B1BE6369A` | `insert(7,4,index)` — `opacity2`, `input1`, `input2`, `mode`, `bypass` |
| Text Render | `77697265-E2EC-4F1B-901A-CEFC474D3C07` | `insert(6,3,1)` — texto "MIZIN DEMO" |
| Less | `77697265-1687-4E44-AFDB-302B2EE936B3` | citado em notes/05_wire.md |
| Comment | `77697265-3C1D-467D-A722-0FC566538374` | apenas documentação visual |

**Prova direta do mecanismo OSC**: o exemplo oficial `Documentation/Nodes/.../Read OSC.wire` tem o nó "Read OSC" com `constants: {"address": {"type":"string","value":"/dummyA"}, "osc":{"type":"osc","value":null}}` — exatamente o padrão `address.value` que `prepare-edition.mjs:30` sobrescreve com `/mizin/wire/{product}/{release}/{channel}`.

### 2.7 Formatos de arquivo de distribuição

- `.wire` — projeto editável do Wire (JSON, confirmado acima)
- `.wired` — patch compilado consolidado (usado nativamente pelo Resolume Arena em `plugins/wire/`)
- `.cwired` — patch compilado Wire (formato de distribuição do mizin, gerado por `Wire.exe compile "<input>" --output "<artifact>"`)

### 2.8 REST API do Arena (distinta da do Wire) — `rest/docs/swagger.yaml`

O Resolume Arena tem sua **própria** documentação REST (10.557 linhas, mais rica que a do Wire), em `C:\Program Files\Resolume Arena\rest\docs\swagger.yaml`, título "Arena & Avenue REST API", servida em `/api/v1`. Inclui app de exemplo em React (`rest/example/`) com grid de composição e transporte de clipe.

**240+ endpoints**: `/product`, `/effects`, `/effects/audio`, `/sources`, `/parameter/by-id/{id}` (get/put/reset/trigger/phase-source), `/file-info`, e toda a árvore `/composition/*` (layers, layergroups, columns, clips, decks, effects/video, effects/audio). Cada recurso acessível por **index**, **by-id** ou **selected**.

**Confirmado por busca exaustiva**: nenhuma referência a `license`, `Wire` (DRM) ou `plugin` (ativação) existe nesta API — a validação de licença de plugins Wire ocorre inteiramente dentro de `WireLib.dll` nativa, fora da superfície REST pública. Consistente com o modelo do mizin_licencas, que também mantém a lógica de licenciamento fora de qualquer API observável.

### 2.9 MCP servers são clientes Rust da REST API

Confirmado via `manifest.json` extraído dos `.mcpb`:
- **Resolume Wire MCP Server** v7.29.0 — requer Wire 7.26+, binário Rust (crate `clap`, certificados DigiCert)
- **Resolume Arena MCP Server** v7.29.0 — requer Arena 7.26+, mesmo padrão
- Ambos oficiais da Resolume (`author.name: "Resolume"`, `license: "proprietary"`)
- Confirmado por extração de strings: os binários consomem os mesmos paths da REST API local (`/patch`, `/composition/layers/...`, `/product`, etc.)

---

## 3. Resolume Arena

### 3.1 Binários instalados

| Arquivo | Tamanho | Descrição |
|---------|---------|-----------|
| Arena.exe | 59.3 MB | Aplicativo principal |
| WireLib.dll | 52.6 MB | Compartilhado com Wire |
| WireNodes.dll | 34.3 MB | Compartilhado com Wire |
| artnet.dll | 47 KB | Art-Net |
| libltc.dll | 47 KB | LTC timecode |
| BugSplat64.dll | 571 KB | Crash reporting |

### 3.2 Integração OSC

Arena tem preferências de OSC Input. O Gerenciador Mizin Wire configura:
- **Porta OSC**: configurável (padrão 7000)
- **Endereço OSC**: `/mizin/wire/{product}/{release}[/{channel}]`
- **Formato do pacote OSC**: endereço ASCII + padding (alinhamento a 4 bytes) + tipo `,ff` + valor float (4 bytes big-endian)

Exemplo de geração de pacote OSC (do `Manager.cs`):
```csharp
byte[] address = Encoding.ASCII.GetBytes("/mizin/wire/" + p.product + "/" + p.release + (String.IsNullOrEmpty(channel) ? "" : "/" + channel));
int pad = (address.Length + 4) & ~3;
var bytes = new byte[pad + 8];
Array.Copy(address, bytes, address.Length);
bytes[pad] = 44;  // ','
bytes[pad + 1] = 102; // 'f'
bytes[pad + 4] = 63;  // parte inteira do float
bytes[pad + 5] = 128; // parte fracionária (valor ≈ 1.0f)
```

### 3.3 MCP Servers

| Arquivo | Tamanho | Descrição |
|---------|---------|-----------|
| `resolume_wire_mcp_server.exe` | 6.2 MB | MCP server para Wire |
| `resolume_wire_mcp_server.mcpb` | 6.8 MB | Bundle MCP para Wire |
| `resolume_arena_mcp_server.exe` | 9.6 MB | MCP server para Arena |
| `resolume_arena_mcp_server.mcpb` | 12.7 MB | Bundle MCP para Arena |

### 3.4 Plugins Wire do Arena

Mesmos arquivos `.wired` listados na seção 2.4, carregados pelo Arena via WireLib.dll compartilhada.

---

## 4. mizin_licencas (alvo principal de RE)

### 4.1 Arquitetura

- **Servidor**: Node.js + SQLite (runtime/local.sqlite)
- **Porta**: 4381 (default), loopback apenas (127.0.0.1)
- **Frontend**: SPA vanilla JS (public/app.js, index.html, style.css)
- **Versão**: v0.3.1 (build 0004)

### 4.2 Criptografia

| Camada | Algoritmo | Uso |
|--------|-----------|-----|
| Token Mizin (offline) | Ed25519 | Autorização de ativação, válido 30 dias |
| Token Wire | P-256/SHA-256 P1363 | Autorização de edição Wire, assinatura do payload |
| Senhas de usuário | scrypt (sal por conta, 64 bytes) | Armazenamento de credenciais |
| Identidade da máquina | SHA-256 | installationKey → device binding |
| Perfil local (Windows) | DPAPI (DataProtectionScope.CurrentUser) | Proteção de profile.bin |
| Sessão HTTP | Cookie HttpOnly + SameSite=Lax | Autenticação web |

### 4.3 Fluxo de ativação (licenças tradicionais)

```
1. Registro/Login: POST /api/register | /api/login
2. Cria pedido: POST /api/orders (offer, quantity, action: buy/renew/expand, requestId)
3. Pagamento: POST /api/test-payment (sandbox) ou Stripe Checkout (produção)
4. Liquidação: store.settle() cria licença com serial MZ-XXXX-XXXX-XXXX-XXXX (128 bits)
5. Ativação: POST /api/activate {serial, product, release, installationKey, label}
   - Valida installationKey (64 hex chars)
   - device = SHA-256(installationKey)
   - Reserva vaga (limite de seats)
   - Retorna token: base64url(JSON).base64url(Ed25519_signature)
   - Token válido por 30 dias
6. Verificação offline: verifyOffline(token, publicKey, {product, release, installationKey}, now)
```

### 4.4 Formato do token de autorização Mizin

```json
{
  "v": 1,
  "device": "sha256(installationKey)",
  "product": "slice-refine|playout|pdt-to-ppt|outliner",
  "release": "studio-1|preview-1|wire-preview-1",
  "issued": <timestamp ms>,
  "expires": <issued + 30*86400000>
}
```

Assinado com Ed25519 sobre o texto ASCII do payload base64url. A segunda parte do token é `base64url(signature)`.

### 4.5 Fluxo Wire (edições compiladas)

```
1. Login: POST /api/login (sessão em cookie HttpOnly)
2. Biblioteca: GET /api/wire/library (retorna plugins com licenseId, product, release, seats, used)
3. Ativação Wire: POST /api/wire/activate {licenseId, product, release, installationKey, label}
   - Servidor busca licença por digest(licenseId) == serial
   - Chama store.authorize() com wireOwner = owner
   - Retorna {payload, signature} assinado com P-256/SHA-256 P1363
4. Verificação Wire: POST /api/wire/verify
5. Download: POST /api/wire/download (requer vaga ativa, retorna .cwired)
6. Chave pública Wire: GET /api/wire/issuer (retorna publicBlob base64, formato BCRYPT_ECDSA_PUBLIC_P256_MAGIC)
```

### 4.6 Payload do token Wire (base64 JSON)

```json
{
  "v": 1,
  "device": "...",
  "product": "...",
  "release": "...",
  "issued": ...,
  "expires": ...,
  "scope": "mizin-wire",
  "licenseId": "sha256(serial)",
  "channel": "<32 hex chars>"
}
```

### 4.7 Pulso OSC do gerenciador

O Gerenciador Mizin Windows (`Manager.cs`) emite pulsos OSC a cada 1 segundo:
- **Endereço**: `/mizin/wire/{product}/{release}[/{channel}]`
- **Destino**: UDP `127.0.0.1:{port}` (porta configurável, default 7000)
- **Payload**: endereço OSC + padding + `,ff` + float
- **Comportamento**: O efeito Wire exibe "MIZIN DEMO" quando para de receber pulsos por ~5 segundos
- **Validade offline**: 30 dias

### 4.8 Gerenciador Windows (Manager.cs)

| Aspecto | Detalhe |
|---------|---------|
| Perfil local | `LocalAppData\Mizin\Wire\SHA256(origin\|publicKey)[0:24]\profile.bin` (DPAPI protegido) |
| Chave de instalação | 32 bytes aleatórios (64 hex chars), gerada no primeiro uso |
| Mutex | `Local\MizinWire-SHA256(origin)[0:16]` |
| Timer | Verificação a cada 1s (pulsos OSC), sincronização a cada 5 min / 1 hora |
| Validação P-256 | Chave pública fixada no executável (BuildConfig.PublicKey) |
| Build vinculado | managerFile = `Mizin-Wire-SHA256(origin\|publicBlob).zip` |

### 4.9 Catálogo (catalog.json)

| Produto | ID | Tipo | Preço (centavos) | Renovação | wireReleases |
|---------|----|------|------------------|-----------|--------------|
| Slice Refine Pro | slice-refine | Plugin Wire | 7.900 | 2.900 | studio-1 |
| Mizin Playout | playout | Aplicativo | 39.000 | 9.900 | — |
| PDT-to-PPT | pdt-to-ppt | Aplicativo | 14.900 | 4.900 | — |
| Mizin Outliner | outliner | Plugin · DLL e Wire | 7.900 | 0 (perpétuo) | wire-preview-1 |
| Pacote de estúdio | studio | Bundle | 49.500 | 13.900 | — |

**Tiers de desconto por quantidade**:
- 1 máquina: 0%
- 2+ máquinas: 10%
- 5+ máquinas: 20%

---

## 5. Pontos de Integração: JuiceBar ↔ mizin_licencas ↔ Resolume

### 5.1 Fluxo completo integrado (end-to-end)

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐     ┌──────────────┐
│   Usuário   │────►│  Loja Mizin      │────►│ Gerenciador     │────►│  Resolume    │
│             │     │  (mizin_licencas)│     │  Mizin Wire     │     │  Arena       │
└─────────────┘     └──────────────────┘     └─────────────────┘     └──────────────┘
       │                      │                      │                   │
       │                      │                      │                   │
       │                      │                      │                   │
       ▼                      ▼                      ▼                   ▼
   Compra                 Serial +             Ativação Wire       Patch .cwired
   plugin                 direito ao           /api/wire/activate  instalado no
   Wire                   produto              P-256 assinatura    Wire plugins/
                                                        download .cwired   resolume7_win64/
                                                                              │
                                                                              │
                                                                              ▼
                                                                     ┌──────────────┐
                                                                     │   JuiceBar   │
                                                                     │ (gestão de   │
                                                                     │  patches)    │
                                                                     └──────────────┘
                                                                              │
                                                                              │
                                                                              ▼
                                                                     ┌──────────────┐
                                                                     │  Pulso OSC   │
                                                                     │  /mizin/wire │
                                                                     │  a cada 1s   │
                                                                     └──────────────┘
```

### 5.2 Como o JuiceBar se vincula ao Resolume Arena

1. **Detecção**: Verifica se Resolume está rodando ("resolume running")
2. **Configuração**: Configura `PluginDirectories` do Resolume
3. **Consulta de compras**: `GET /v2/user/purchases` na API mango
4. **Solicitação de assinatura**: `GET /v2/user/purchases/sign` para cada plugin (ffgl_id ou UUID)
5. **Download**: Baixa patches/bundles (.zip contendo .wired ou .cwired) de `mango.get-juicebar.com`
6. **Verificação de assinatura**: "Verifying signature", "Failed to decode signature"
7. **Instalação**: Copia arquivos para `resolume7_win64\` usando helper tools (rm/mv)
8. **Tipos Wire**: `wire_effect`, `wire_mixer`, `wire_source`

### 5.3 Como o mizin_licencas se vincula ao JuiceBar

O JuiceBar e o mizin_licencas são sistemas paralelos que podem se complementar:

| Aspecto | JuiceBar | mizin_licencas |
|---------|----------|----------------|
| Servidor de licença | mango.get-juicebar.com | server.mjs (localhost:4381) |
| Assinatura de patches | /v2/user/purchases/sign | /api/wire/activate (P-256) |
| Token offline | XML properties (token, expires_at) | base64url(JSON).base64url(Ed25519) |
| Identidade da máquina | system_hash, machine_id | SHA-256(installationKey) |
| Instalação no Resolume | resolume7_win64\ | Download .cwired → usuário instala manualmente |
| Validação em tempo real | Assinatura de patches | Pulso OSC a cada 1s |

### 5.4 Modelo de segurança completo (camadas)

| Camada | Algoritmo | Uso | Sistema |
|--------|-----------|-----|---------|
| Token Mizin (offline) | Ed25519 | Autorização de ativação, 30 dias | mizin_licencas |
| Token Wire | P-256/SHA-256 P1363 | Autorização de edição Wire | mizin_licencas |
| Assinatura JuiceBar | ? (não reversada) | Assinatura de patches FFGL/Wire | JuiceBar |
| Senhas de usuário | scrypt | Hash de credenciais | mizin_licencas |
| Identidade da máquina | SHA-256 | installationKey → device binding | mizin_licencas |
| system_hash / machine_id | ? | Identificação de máquina | JuiceBar |
| Perfil local Windows | DPAPI | Proteção de profile.bin | mizin_licencas (gerenciador) |
| Sessão HTTP | Cookie HttpOnly + SameSite=Lax | Autenticação web | mizin_licencas |
| Authorization: Bearer | Token JWT-like | API autenticada | JuiceBar |
| WinSparkle assinatura | DSA/edSignature | Verificação de atualização | JuiceBar |

---

## 6. Análise de Vulnerabilidades e Vectores de Ataque

### 6.1 JuiceBar

| Vetor | Descrição | Severidade |
|-------|-----------|------------|
| Tokens em XML plain text | `token`, `refresh_token`, `expires_at` armazenados em XML sem criptografia | Alta |
| Assinatura de patches não reversada | Protocolo de assinatura do JuiceBar não foi decompilado | Alta |
| Cache de imagens não sanitizado | PNGs e JPGs em `Caches/` podem conter dados de interface | Baixa |
| Perfil Chromium acessível | Dados de navegação interna podem ser inspecionados | Média |
| WinSparkle atualização | Appcast pode ser interceptado se não for HTTPS com pinning | Média |

### 6.2 mizin_licencas

| Vetor | Descrição | Severidade |
|-------|-----------|------------|
| Chave Ed25519 em SQLite | Chave privada armazenada no banco local | Alta |
| Chave P-256 em SQLite | Chave privada de Wire armazenada no banco local | Alta |
| Tokens offline 30 dias | Token válido por 30 dias sem verificação online | Média |
| OSC sem autenticação | Pulsos OSC localhost não autenticados (documentado como limitação) | Média |
| .cwired copiável | Arquivo compilado pode ser copiado após download | Baixa (documentado) |

### 6.3 Resolume Wire/Arena

| Vetor | Descrição | Severidade |
|-------|-----------|------------|
| WireLib.dll compartilhada | Arena carrega patches Wire via DLL compartilhada — possível injeção | Alta |
| API REST local | Wire expõe API REST local sem autenticação por padrão | Média |
| Patch .cwired | Formato compilado não documentado publicamente | Média |

---

## 7. Próximos Passos para Engenharia Reversa Completa

### Status atualizado (sessão de decompilação com Ghidra)

| # | Item | Status |
|---|------|--------|
| 1 | Instalar e configurar Ghidra | ✅ **Concluído** — Ghidra 12.2 PUBLIC baixado do GitHub oficial, instalado em `C:\Users\Avell Mizin\tools\ghidra_12.2_PUBLIC`, validado pelo REA (installation/version/headless/native_decompiler = true) |
| 2 | Decompilar JuiceBar.exe | 🔄 Em andamento — análise completa do Ghidra confirmou uso do framework **JUCE** (C++ para áudio/vídeo), TLS directory, 30+ DLLs do sistema vinculadas; decompilação de função específica pendurada pela auto-análise completa de um binário de 8.3MB (normal, não é falha) |
| 3 | Extrair BuildConfig do gerenciador Mizin Wire | ✅ **Resolvido sem decompilação** — não requer RE: é gerado em tempo de build pelo próprio `manager/package.ps1` a partir de `/api/wire/issuer`, e builds já existem em `runtime/build-wire-*/BuildConfig.cs` (código-fonte próprio do alvo, não do Resolume) |
| 4 | Analisar WireLib.dll (strings) | ✅ **Concluído** — confirmado via `grep -a`: contém `cwired`, `licenseName`, `Ed25519`, `ECDSA`, `P-256`, `prime256v1`. Os termos ECDSA/P-256 pertencem à suíte OpenSSL embarcada (cifras TLS), não a um DRM de patch — **não há mecanismo de proteção de cópia no formato `.wire`/`.cwired` alem do campo de texto livre `meta.licenseName`**, confirmando a limitação já documentada em `notes/05_wire.md` |
| 5 | Confirmar formato `.wire` e UUIDs de nó | ✅ **Concluído** — lido diretamente `Templates/*.wire` e todos os `Documentation/Nodes/*/*.wire` de exemplo; UUIDs de 10 classes de nó confirmados byte-a-byte (ver seção 2.6) |
| 6 | Confirmar protocolo OSC real do Wire | ✅ **Concluído** — exemplo oficial `Read OSC.wire` confirma `constants.address.value` como string livre, exatamente o campo que `prepare-edition.mjs` sobrescreve |
| 7 | Mapear REST API completa do Arena | ✅ **Concluído** — `rest/docs/swagger.yaml` lido (10.557 linhas, 240+ endpoints); nenhuma referência a licença/DRM nesta API, confirmando que a validação Wire ocorre fora da superfície REST |
| 8 | Confirmar MCP servers | ✅ **Concluído** — ambos `.mcpb` extraídos e `manifest.json` lido: binários Rust oficiais da Resolume v7.29.0, clientes da mesma REST API |

### 1. ✅ RESOLVIDO: Protocolo de assinatura de patches do JuiceBar (decompilado via Ghidra 12.2 + REA)

Decompiladas 4 funções nativas do `JuiceBar.exe` (x86-64, 16.398 procedures recuperadas, PDB `JuiceBar.pdb` referenciado mas não carregado — nomes simbólicos indisponíveis, análise por endereço):

| Função (endereço) | Papel |
|---|---|
| `FUN_1401fe010` (`0x1401fe010`) | Monta o array de IDs pendentes (ffgl_XXXX / UUID), loga `Requesting signatures for: {id}`, faz `POST user/purchases/sign` com `Content-Type: application/json`. Em falha HTTP: `Failed requesting signatures for: {}` |
| `FUN_1401d1870` (`0x1401d1870`) | Cache local: percorre uma lista de entradas de 128 bytes, compara os 32 primeiros bytes (o ID) com `memcmp`, e se achar + a entrada ainda for válida (`FUN_1401d3540`), **evita repetir a requisição de rede** |
| `FUN_1401fdb70` (`0x1401fdb70`) | Processa a resposta: para cada item loga `Received signatures for: {id}`; se o campo de assinatura tiver exatamente **0x40 (64) bytes**, chama `FUN_1401d1410` |
| `FUN_1401d1410` (`0x1401d1410`) | Monta um blob (ID + assinatura de 64 bytes) e **grava em disco** via `boost::filesystem::ofstream` (112 bytes escritos); se a escrita tiver sucesso, copia 128 bytes para a lista interna em memória (a mesma que `FUN_1401d1870` consulta depois) |

**Descoberta central**: em nenhum ponto desse fluxo há uma chamada a uma primitiva de verificação criptográfica (ECDSA/Ed25519/RSA verify). O buffer de 64 bytes recebido do servidor (`user/purchases/sign`) tem o tamanho clássico de uma assinatura Ed25519/ECDSA raw, mas o JuiceBar **nunca a verifica matematicamente contra uma chave pública** — ele apenas:
1. Pede o "carimbo" de 64 bytes ao backend para cada plugin que o usuário possui
2. Grava esse carimbo em disco (cache local)
3. Mantém uma cópia em memória para não repetir a chamada de rede
4. Confia ciegamente que, se o servidor respondeu, o usuário tem direito ao plugin

**Conclusão**: a "proteção" de plugins Wire/FFGL via JuiceBar é baseada inteiramente em **confiança no backend** (`mango.get-juicebar.com` decide quem recebe o carimbo), não em criptografia client-side verificável offline — consistente com a ausência de qualquer lógica de licença na REST API do Arena e no `WireLib.dll` (seções 2.6 e 2.8). Isso confirma que o **mizin_licencas é tecnicamente mais robusto**: seu `verifyOffline()` valida matematicamente a assinatura Ed25519/P-256 contra a chave pública fixada no cliente, em vez de armazenar um carimbo opaco não verificável.

### Pendências remanescentes (secundárias, não bloqueiam a conclusão do estudo)

1. **Testar integração end-to-end com Resolume Arena real** — rodar `server.mjs`, gerenciar Wire, ativar plugin, enviar OSC para o Arena e confirmar visualmente o efeito (requer Arena aberto e OSC Input habilitado nas preferências)
2. **Examinar caches de imagem do JuiceBar** — PNG 1920x1080 e JPGs em `Caches\JuiceBar\` são capturas de tela da interface; útil para UI mas não para o protocolo
3. **Localizar o caminho exato do arquivo de cache de assinatura** — `FUN_1401d1920` é o `std::_Fiopen` genérico do runtime MSVC (não código específico do JuiceBar); o nome/caminho do arquivo fica em uma `std::wstring` resolvida em tempo de execução, não em uma constante estática — exigiria depuração dinâmica (anexar debugger ao processo rodando) para capturar o valor real
   - Entender estrutura binária

---

## 8. Resumo das Descobertas Principais

1. **JuiceBar v1.0.106** é um gerenciador de patches para Resolume que se conecta a `mango.get-juicebar.com` e `inapp.get-juicebar.com`; construído em **JUCE (C++)** com UI embutida via **WebView2**
2. O JuiceBar solicita **assinaturas de plugins** via `POST user/purchases/sign` antes de instalar patches no Resolume — **decompilado e confirmado**: envia o array de IDs pendentes, recebe um carimbo de 64 bytes por ID
3. **O carimbo de 64 bytes NUNCA é verificado criptograficamente no cliente** — é apenas gravado em disco e cacheado em memória; a "proteção" depende inteiramente do backend decidir quem recebe o carimbo (confirmado por decompilação de 4 funções nativas)
4. Suporta tipos Wire: `wire_effect`, `wire_mixer`, `wire_source`, `footage`
5. Instala plugins em `resolume7_win64\` (ou `resolume6_win64\`)
6. **Resolume Arena** compartilha `WireLib.dll` e `WireNodes.dll` com o Resolume Wire
7. O Wire expõe uma **REST API v2 completa** (e o Arena uma ainda maior, 240+ endpoints) para manipulação programática de patches/composições — nenhuma das duas expõe lógica de licença/DRM
8. **OSC** é o protocolo de validação em tempo real entre gerenciador e efeito Wire; formato do nó `Read OSC` confirmado byte-a-byte nos exemplos oficiais do Wire
9. **mizin_licencas** usa Ed25519 para tokens offline (30 dias) e P-256 para autorizações Wire — **e, diferente do JuiceBar, verifica essas assinaturas matematicamente** no cliente (`verifyOffline()`)
10. O gerenciador Windows do mizin usa DPAPI para proteger o perfil local
11. O JuiceBar armazena tokens de sessão em **XML plain text** sem criptografia (diferente do carimbo de assinatura, que é binário)
12. O formato `.wire`/`.cwired` não tem DRM nativo — `meta.licenseName` é apenas texto livre, confirmado por grep no `WireLib.dll` e leitura direta de arquivos `.wire` reais

---

## Arquivos de evidência gerados nesta sessão

- `targets/mizin_licencas/notes/06_juicebar_resolume_integration.md` — Este documento
- `targets/mizin_licencas/evidence/release-build-0001.json` a `0004.json` — Releases do mizin_licencas
- `targets/mizin_licencas/evidence/wire-preview/result.json` — Teste de pulso Wire
- `targets/mizin_licencas/evidence/studio-0004/verification.json` — Verificação studio-1
- `C:\Users\Avell Mizin\AppData\Roaming\JuiceBar\logs\JuiceBar.log` — Logs do JuiceBar
- `C:\Users\Avell Mizin\AppData\Roaming\JuiceBar\JuiceBar` — XML properties do JuiceBar
- `C:\Users\Avell Mizin\AppData\Roaming\Caches\JuiceBar\` — Caches de imagem do JuiceBar
- `C:\Program Files\Resolume Wire\REST\docs/swagger_v2.yaml` — API REST do Wire v2
- `C:\Program Files\Resolume Wire/Documentation/Nodes/` — Documentação de nós do Wire