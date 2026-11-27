# PLUGNEX App — cliente nativo Windows (C++/Win32)

Sucessor funcional do antigo Gerenciador Mizin Wire (`manager/Manager.cs` +
`manager/ManagerPanel.cs`, C#/.NET Framework). Mesma ideia — app desktop que
fala com a central de licenças (`server.mjs`) e com o Resolume Wire/Arena —
estendida para cobrir compras de plugins **DLL** além de Wire, e reescrita em
C++/Win32 nativo (sem dependência de runtime .NET) para reduzir a superfície
de ataque e o tempo de inicialização.

**Visual**: interface "Graphite Edition" — réplica funcional do protótipo em
[`../../visual/plugnex.html`](../../visual/plugnex.html) (ver também
[`../../visual/START_HERE_IDE.md`](../../visual/START_HERE_IDE.md)), desenhada
à mão em GDI/GDI+ (sem framework de UI): 5 abas (Discover, My Plugins,
Updates, Licenses, Settings) sobre um shell de 3 painéis (biblioteca ·
tabela · inspector), tokens de cor exatos do protótipo (`src/theme.h`), logo
PLUGNEX real embutido como recurso. Diferente do protótipo (que é só HTML
estático com dados simulados em memória), aqui cada tela mostra dados reais
da conta — catálogo, posse, ativação — e cada botão aciona o backend de
verdade.

## O que o app faz

- Login/logout na conta da central de licenças (mesma conta do site).
- Lista a biblioteca de plugins comprados (diretos/DLL **e** Wire, unificados
  numa única lista).
- Ativa a máquina atual numa licença (consome uma vaga, até o limite de
  `seats` da licença).
- Desautoriza a máquina atual (libera a vaga no servidor **e** descarta a
  autorização local, mesmo offline).
- Baixa o build correspondente (`.cwired` para Wire, `.zip` para DLL) com
  diálogo nativo "Salvar como".
- Mantém um heartbeat local (1x/segundo) que reverifica a assinatura de cada
  autorização salva e, para itens Wire, envia o pulso OSC que o grafo
  injetado pelo `prepare-edition.mjs` espera para suprimir a marca-d'água —
  ver [`../../notes/06_juicebar_resolume_integration.md`](../../notes/06_juicebar_resolume_integration.md).
- "Ver na loja" abre o site (`/?produto=<oferta>`) no navegador padrão — a
  compra em si acontece no site, não dentro do app (arquitetura confirmada
  com o usuário: o app fala com a central, o site é a loja).

## Arquitetura

```
src/
  httpclient.h     API HTTP (WinHTTP) — JSON in/out, cookie de sessão, download em streaming.
  crypto.h         Verificação offline: Ed25519 (tokens diretos) + P-256/CNG (provas Wire).
  profile.h        Perfil local criptografado (DPAPI, CurrentUser) — chave de instalação, sessão, autorizações salvas.
  osc.h            Pulso UDP OSC idêntico byte-a-byte ao do Manager.cs original.
  catalog_logic.h  Regras de catálogo/licença em funções puras (sem Win32) — testável isoladamente.
  theme.h          Tokens de cor/fonte/métrica "Graphite" (de visual/) + helpers de desenho GDI.
  icons.h          Glifos genéricos de categoria (App/Plugin/Wire) para os tiles e o hero do inspector.
  resource_ids.h   IDs de recurso compartilhados entre app.rc e main.cpp (ex.: o logo embutido).
  main.cpp         Shell "Graphite" owner-drawn (GDI+) + poucos controles nativos (login, busca, porta OSC).
vendor/
  json.hpp               nlohmann/json v3.11.3 (single header, MIT).
  ed25519/               orlp/ed25519 (domínio público) — verify.c é o único caminho usado em produção.
resources/
  app.rc, plugnex.ico, logo-horizontal.png    Ícone, VERSIONINFO e logo PLUGNEX embutidos no executável.
test/
  test_crypto.cpp         Valida crypto.h contra tokens REAIS emitidos por licensing.mjs/wire-manager.mjs.
  test_profile.cpp        Round-trip DPAPI real (não mockado).
  test_osc.cpp             Compara o pacote OSC byte-a-byte contra uma reimplementação independente do original em C#.
  test_catalog_logic.cpp  Valida contra respostas REAIS de /api/catalog, /api/account, /api/wire/library.
build.ps1          Compila Plugnex.exe via MSVC (cl.exe), gerado por LICENSE_ORIGIN/VERSION do alvo.
```

Cada header de lógica/protocolo em `src/` (`crypto.h`, `profile.h`, `osc.h`,
`catalog_logic.h`) foi validado isoladamente em `test/` **antes** de
`main.cpp` usá-lo. Todos os testes usam dados reais (tokens assinados pelo
`licensing.mjs`/`wire-manager.mjs` deste mesmo alvo, respostas reais de
`/api/*` capturadas de uma instância real do servidor), nunca mocks da
própria lógica sob teste. `theme.h`/`icons.h` são puramente de apresentação e
não têm teste próprio — validados visualmente (ver "Testado manualmente"
abaixo).

### Por que GDI/GDI+ "manual" em vez de controles nativos para tudo

O visual aprovado (`visual/plugnex.html`) usa abas retas com sublinhado,
linhas de tabela com hover/seleção customizados, chips de estado coloridos e
um inspector com hero/gradiente — nada disso existe como controle Win32
padrão sem reescrever o estilo visual de cada um (`owner-draw` em todo
lugar, de qualquer forma). A escolha foi desenhar a casca inteira
(header/menu/abas/sidebar/tabela/inspector/footer) manualmente em `paint()`
via GDI+ e usar controles nativos reais **só** onde há edição de texto de
verdade (e-mail, senha, porta OSC, busca) — ali, reimplementar
c‍ursor/seleção/IME à mão não vale a pena e o Win32 já resolve isso
corretamente.

## Protocolo de confiança offline

Replicado do protocolo original (`notes/03_protocols_apis.md`,
`notes/06_juicebar_resolume_integration.md`), **não um novo desenho**:

- **Ativação direta (DLL/app)**: `POST /api/activate` devolve um token
  `payload.assinatura` — payload é `base64url(JSON{v,device,product,release,
  issued,expires})`, assinado em Ed25519 sobre o texto ASCII do payload.
  `crypto::verifyDirectToken()` reproduz exatamente `verifyOffline()` de
  `licensing.mjs`: checa assinatura, `device` (SHA-256 da chave de instalação
  local), `product`/`release` e a janela `issued <= agora < expires`
  (30 dias). Qualquer falha retorna "sem autorização" — nunca lança uma
  exceção que poderia ser silenciosamente ignorada.
- **Prova Wire**: `POST /api/wire/activate` devolve `{payload, signature}` —
  payload é `base64(JSON{...claims, scope:"mizin-wire", licenseId, channel})`,
  assinado em ECDSA P-256 (CNG, `ieee-p1363` cru) sobre SHA-256 do payload.
  `crypto::verifyWireProof()` reproduz `Local.Check()` do `Manager.cs`
  original: mesma checagem de `scope`, `product`/`release`/`licenseId`,
  `device` e janela temporal.
- Nenhuma chave privada mora no cliente. A chave pública Ed25519 vem de
  `GET /api/public-key` (SPKI PEM); a chave pública Wire (CNG blob de 72
  bytes) vem de `GET /api/wire/issuer`. O app verifica matematicamente
  **ambas** — diferente do JuiceBar, que apenas grava o carimbo do servidor
  sem verificação (ver `notes/06_juicebar_resolume_integration.md` seção 1).

## Concorrência

O app tem três threads: a UI (mensagens Win32 + `paint()`), um worker
descartável por operação assíncrona (`runAsync()` — login, refresh,
ativar, baixar) e o heartbeat (pulso OSC a cada 1s). Dois mutexes protegem
todo o estado compartilhado:

- `AppState::profileMutex` — guarda `profile` (chave de instalação, sessão,
  autorizações salvas), tocado pela UI, pelos workers e pelo heartbeat.
- `AppState::modelMutex` — guarda o "modelo da tela" (`catalog`, `rows`,
  `signedIn`, `currentEmail`, as chaves públicas Ed25519/Wire), escrito
  pelos workers (`loadCatalog`/`rebuildRows`/login/logout) e lido pela UI
  (`paint()`, que o Windows pode chamar a qualquer momento via `WM_PAINT`,
  não só logo após `InvalidateRect`) e pelo heartbeat.

Todo acesso a esses campos passa por um dos métodos `snapshot*()` de
`AppState` (`snapshotRows`, `snapshotModel`, `snapshotCatalog`,
`snapshotKeys`) — cada um copia o dado sob o lock e devolve a cópia; o lock
nunca fica seguro durante I/O de rede ou desenho. `paint()` tira **um**
snapshot (`snapshotModel()`) no início e usa essa cópia consistente para o
frame inteiro, em vez de reler `app->rows`/`app->signedIn` em pontos
diferentes do desenho.

Os dois mutexes nunca se aninham (nenhuma função que já segura um tenta
adquirir o outro), então não há risco de deadlock entre eles.

> Esse esquema de sincronização foi adicionado **depois** de um crash real
> encontrado durante o teste manual desta sessão: `app->rows` (um
> `std::vector`) era escrito por `rebuildRows()` numa thread de trabalho
> enquanto `paint()` o lia na UI thread sem nenhum lock — uma corrida de
> dados clássica, reproduzida de forma determinística ao fazer login pela
> UI (que dispara `rebuildRows()` em background) enquanto o Windows
> repintava a janela. Ver `notes/` para o relato completo da investigação.

## Compilar

Requer Visual Studio com o workload "Desktop development with C++"
(testado com VS 2026 Community, MSVC 14.51, mas qualquer MSVC com
`/std:c++17` funciona).

```powershell
cd targets/mizin_licencas/reconstructed/plugnex-app
.\build.ps1                                      # usa http://127.0.0.1:4381 (padrão de dev)
.\build.ps1 -Origin 'https://plugnex.pages.dev'   # build de produção, se/quando houver um backend lá
```

Cada build fixa a origem (`PLUGNEX_ORIGIN_HOST/PORT/TLS`) e a versão
numérica (lida do `VERSION` deste alvo) como constantes de compilação —
igual ao `package.ps1` original gerava um `BuildConfig.cs` por build. Isso é
intencional: trocar de ambiente é recompilar, nunca reconfigurar um binário
já distribuído (mesma política de segurança do cliente anterior).

> **`plugnex.pages.dev` hoje**: o domínio ainda não tem o backend Node
> (`server.mjs`) publicado atrás dele — Cloudflare Pages roda Workers, que
> não hospedam um processo Node com SQLite e `child_process.spawn()` para o
> `Wire.exe`/PowerShell como este servidor exige. O app pode ser compilado
> apontando para esse domínio no dia em que ele resolver para o backend real
> (atrás de um proxy reverso para este mesmo `server.mjs`, por exemplo); até
> então, builds de homologação devem usar `http://127.0.0.1:4381`.

## Testar

```powershell
# Cada teste é standalone; veja o cabeçalho de cada .cpp para o comando cl.exe exato.
cd test
cl /std:c++17 /EHsc /W4 /nologo test_crypto.cpp ..\vendor\ed25519\sha512.c ..\vendor\ed25519\fe.c ..\vendor\ed25519\ge.c ..\vendor\ed25519\sc.c ..\vendor\ed25519\verify.c bcrypt.lib crypt32.lib /Fe:test_crypto.exe
.\test_crypto.exe
```

Os fixtures `ed25519_fixture.json`/`wire_fixture.json`/`catalog_fixture.json`/
`account_fixture.json`/`wire_library_fixture.json` em `test/` foram gerados a
partir de uma instância real do servidor (`node --input-type=module` chamando
`licensing.mjs`/`wire-manager.mjs` diretamente, ou `curl` contra um
`server.mjs` rodando) — não são dados inventados. Para regenerá-los depois
de uma mudança no protocolo, repita os comandos documentados no histórico de
desenvolvimento (ou peça para o agente/desenvolvedor atual regenerar).

## Testado manualmente (end-to-end, servidor real)

**Versão com controles Win32 simples** (2026-11-25, antes da reconstrução
visual "Graphite"): contra uma instância isolada de `server.mjs`, dirigindo
a GUI via mensagens Win32 — cadastro → compra → pagamento simulado → login
no app → ativar nesta máquina → baixar o build (conteúdo confirmado
byte-a-byte contra o artefato publicado) → desautorizar máquina. Cada etapa
confirmada tanto pela UI quanto por consulta direta a `/api/account` no
servidor.

**Versão "Graphite" atual** (mesma data, logo em seguida): a interface foi
inteiramente reconstruída para seguir `visual/plugnex.html` (ver seção
"Visual" acima). Repetido o mesmo tipo de teste, agora contra a nova
interface: login real pela tela de Settings, navegação pelas 5 abas,
seleção de linha na tabela (My Plugins), clique em Activate no inspector —
confirmado tanto visualmente (capturas de tela da janela real) quanto por
consulta a `/api/account`, que mostrou o dispositivo (`DESKTOP-BBB9G7I`)
realmente registrado no servidor após o clique. Também rodado um teste de
estresse (dezenas de cliques de troca de aba e refresh em sequência rápida,
disparando `rebuildRows()` em background repetidamente) para validar a
correção de concorrência descrita abaixo.

**Correções de idioma/texto/estilo dos controles nativos** (mesma data,
depois de capturas de tela reais mostrarem os problemas): tradução completa
da interface para português, correção da flag `/utf-8` ausente no `cl.exe`
(causa raiz de todo o texto acentuado saindo corrompido), redistribuição de
largura de colunas para não cortar o texto de ação mais longo, e
restyling dos controles nativos (EDIT/BUTTON) para o tema Graphite —
incluindo a descoberta de que `WS_EX_CLIENTEDGE` sempre desenha uma borda
clara independente da cor devolvida por `WM_CTLCOLOREDIT` (diagnosticado
por amostragem de pixel direto numa captura de tela real, não só "parece
certo"). Ver `notes/08_plugnex_rebrand_e_app_nativo.md` seção "Terceira
rodada" para o relato completo da investigação.

**Correção de corte de texto VERTICAL** (2026-11-26, depois do usuário
reportar que o texto ainda aparecia cortado mesmo após a rodada acima):
três caixas de texto em `paint()` (título de cada aba, linha "SERVIDOR" no
rodapé da barra lateral, nome do plugin na tabela) eram mais baixas que a
altura real da fonte usada -- confirmado medindo com `GetTextMetrics` via
P/Invoke em vez de assumir pelo "parece cortado" de uma captura de tela,
cortando o rabicho de "ç" e descendentes de "g"/"p"/"q". Diferente da
correção de largura de coluna da rodada anterior (eixo horizontal), essa é
no eixo vertical e afeta as 5 abas igualmente. Ver seção "Quarta rodada" em
`notes/08_plugnex_rebrand_e_app_nativo.md` para a tabela de medições e o
método de verificação.

**Navegação lateral, conta e atualização de catálogo** (2026-11-26): as
quatro opções de Gerenciamento agora são clicáveis, compartilham a mesma
navegação das abas e destacam a tela ativa. "Minha conta" no cabeçalho abre
Configurações. "Atualizar catálogo" é um botão nativo independente da busca,
com ícone vetorial e estado de sincronização; preserva o filtro digitado.
Testado na janela real com `test/test_ui_navigation.ps1`, incluindo a largura
mínima de 1040px, capturas e zoom 2x do cabeçalho/menu/botão em
`build/ui-validation/`. Nenhuma compra, ativação ou alteração de perfil é
feita por esse teste. Requer o backend local em execução:

```powershell
.\test\test_ui_navigation.ps1
```

`test/test_async_ui.cpp` testa a implementação real de `runAsync` e os
handlers de conclusão/erro numa janela isolada, sem rede ou perfil. Confirma
que erros de transporte/API não viram sucesso e que o botão volta a ficar
disponível. Comando de compilação no cabeçalho do teste.

O script `build.ps1` agora espera somente o processo do compilador, evitando
a espera indefinida da árvore de processos observada no terminal PS5.1.

## Pendências conhecidas

- Sem instalador (`.msi`/`.exe` de setup) ainda — hoje é o `.exe` solto mais
  o ícone embutido. Se for necessário um instalador com atalhos de
  Desktop/Menu Iniciar, isso é um passo adicional sobre o binário atual.
- `plugnex.pages.dev` precisa de um backend real atrás dele antes de um
  build apontando para esse domínio funcionar de fato (ver seção "Compilar").
- A lista "Updates" nunca mostra cardinalidade diferente de "0 updates" nos
  dados de teste atuais (não há no catálogo de homologação um produto com
  duas releases diretas distintas sob a mesma licença) — a lógica
  (`computeInstallState`) está testada isoladamente em
  `test_catalog_logic.cpp`, mas o caminho "update disponível" em `paint()`
  em si ainda não foi observado visualmente contra dados reais, só por
  teste unitário puro.

### Bug real encontrado e corrigido durante a reconstrução "Graphite"

Ao testar a nova interface manualmente, o processo morria silenciosamente
(sem crash reportado no Visualizador de Eventos) logo depois do login. A
causa raiz: `app->rows` (um `std::vector<Row>`) era reescrito do zero por
`rebuildRows()` numa thread de trabalho (disparada pelo próprio login)
enquanto `paint()`, na UI thread, podia estar no meio de uma iteração sobre
o mesmo vetor — uma corrida de dados clássica sobre um `std::vector`, sem
nenhuma sincronização. O mesmo valia para `catalog`, `signedIn`,
`currentEmail` e as chaves públicas, todas lidas por `paint()`/pelo
heartbeat e escritas pelos workers sem lock algum.

Corrigido adicionando `AppState::modelMutex` e um conjunto de métodos
`snapshot*()` (ver seção "Concorrência" acima) que todo leitor e escritor
desses campos agora usa. Confirmado corrigido reproduzindo o cenário exato
que crashava (login real pela UI) repetidas vezes, mais um teste de
estresse de cliques rápidos — ambos sobreviveram sem queda após a correção.
