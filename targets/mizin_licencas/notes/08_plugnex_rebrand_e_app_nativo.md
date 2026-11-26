# PLUGNEX: rebrand e app nativo Windows (sessão de 2026-11-25)

> Continuidade para quem pegar este alvo depois. Resumo do que foi feito,
> por quê, e o que ficou pendente. Ver também o `CHANGELOG.md` — entradas
> [v0.4.0](../CHANGELOG.md#v040-build-0005---2026-11-25) (rebrand + primeira
> versão do app), [v0.4.1](../CHANGELOG.md#v041-build-0006---2026-11-25)
> (reconstrução visual "Graphite" + correção de concorrência) e
> [v0.4.2](../CHANGELOG.md#v042-build-0007---2026-11-25) (idioma, corte de
> texto, estilo dos botões nativos) — para a lista formal de mudanças por
> categoria.

## Contexto

O usuário decidiu renomear a marca de **Mizin** para **PLUGNEX**
(`plugnex.pages.dev`) e pediu um app desktop completo (login, biblioteca,
ativação/desautorização de máquina, compra e download de plugins DLL **e**
Wire). Material de marca fornecido:
`PLUGNEX_Brand_Kit_v1.0.zip` + `PLUGNEX_INSTRUCOES_PARA_IDE.md` (handoff de
design com tokens, paleta, regras de uso de logo e WCAG AA).

## O que foi feito

### 1. Regressão encontrada e corrigida antes de qualquer coisa nova

Ao reler `licensing.mjs` no início desta sessão, as funções `settle()` e
`verifyOffline()` (exportada) estavam **ausentes** — haviam sido removidas
numa edição anterior desta mesma sessão de trabalho, antes do contexto ser
resumido. Isso quebrava `server.mjs` (`store.settle` undefined),
`payments.mjs` e toda a suíte `node --test`. Restauradas ambas, mantendo as
melhorias de status HTTP (`fail(msg, status)`) que já estavam no arquivo.
Confirmado com `node --test` (6/6 passando) antes de prosseguir.

Também corrigido um `ReferenceError` real em `submissions.mjs` (linha do
log de `approve()`: `cat.products.map(p=>x.id)` usava a variável
inexistente `x` em vez de `p`) — quebraria o endpoint de aprovação de
submissões de terceiros assim que um admin tentasse aprovar algo.

### 2. Rebrand visual (web)

- Kit extraído para `public/assets/brand/` (estrutura original preservada:
  `01_Referencia/`, `02_Logos/`, `03_Icones/`, `04_Integracao_IDE/`,
  `05_Manual/`).
- `public/style.css` reescrito do zero usando os tokens do
  `plugnex-theme.css` do kit (fundo `#0A0B1E`, superfícies `#111B3D`/
  `#172344`, primária `#2F6BFF`, ciano `#00E5FF`, violeta `#A855FF`) — tema
  escuro, contraste conferido manualmente contra os pares de cor
  realmente usados (não apenas presumido).
- `index.html`/`author.html`/`user.html`: título, `<link rel="icon">`,
  logo horizontal SVG no header (substitui o badge de texto "M" antigo),
  `aria-current="page"` nos links de navegação ativos.
- `server.mjs`: nova rota estática `/assets/brand/*` com guarda contra
  path traversal (`rel.includes('..')`, prefixo de diretório verificado) e
  whitelist de `Content-Type` por extensão; `assets` map ganhou
  `/favicon.png` e `/favicon.ico`. Também corrigido: o `Content-Type` dos
  arquivos estáticos agora só recebe `; charset=utf-8` para tipos de texto
  (antes ia incondicionalmente, inclusive em PNG/ICO).
- Textos de UI ("Loja Mizin" → "Loja PLUGNEX", "Gerenciador Mizin" → "app
  PLUGNEX", etc.) em `app.js`, `licensing.mjs`. O campo interno
  `scope:"mizin-wire"` dentro dos tokens assinados foi **mantido**
  deliberadamente — é um identificador de protocolo invisível ao usuário,
  e mudá-lo quebraria clientes/tokens já emitidos sem nenhum ganho visível.
- Rota/arquivo do gerenciador renomeados: `/downloads/mizin-wire.zip` →
  `/downloads/plugnex-app.zip`; `managerFile` agora é
  `Plugnex-App-<hash>.zip` em vez de `Mizin-Wire-<hash>.zip`.

### 3. Nova rota de download para plugins DLL

`POST /api/download` em `server.mjs`, espelhando exatamente o padrão de
segurança de `/api/wire/download`: resolve a licença pelo `serial`
**apenas dentro das licenças do usuário autenticado** (`store.dashboard`),
chama `store.authorize(data, false)` (exige vaga já ativada nesta máquina)
antes de liberar o arquivo em `LICENSE_DATA/dll-plugins/<produto>--<release>.zip`.
Teste adicionado em `test/http.test.mjs` cobrindo o caminho de sucesso e a
rejeição por serial de outra conta (403).

### 4. App nativo PLUGNEX (`reconstructed/plugnex-app/`)

C++17/Win32 puro (MSVC, sem .NET). Sucessor funcional de
`manager/Manager.cs` + `ManagerPanel.cs`, estendido para DLL + Wire. Ver o
[README do app](../reconstructed/plugnex-app/README.md) para arquitetura
completa. Pontos que vale destacar para continuidade:

- **Protocolo de confiança é o mesmo de sempre**, só reimplementado em C++
  nativo: Ed25519 (tokens diretos, via `orlp/ed25519` — domínio público,
  baixado e conferido por SHA-256 nesta sessão) e ECDSA P-256 via CNG
  (provas Wire, igual ao `Manager.cs` original já fazia). Nenhuma chave
  privada no cliente.
- **Cada peça foi validada isoladamente contra dados reais antes da GUI
  existir**: gerei fixtures reais rodando `licensing.mjs`/`wire-manager.mjs`
  diretamente (`node --input-type=module`) e capturando respostas reais de
  `/api/catalog`, `/api/account`, `/api/wire/library` via `curl` contra uma
  instância real do servidor — não inventei nenhum dado de teste. Os quatro
  `test_*.cpp` em `test/` ficam como regressão permanente.
- **Testado manualmente de ponta a ponta**: subi uma instância isolada do
  servidor (porta/diretório de dados dedicados), dirigi a GUI via mensagens
  Win32 (`WM_COMMAND`/`LB_SETCURSEL`/etc. — ver histórico de comandos desta
  sessão para os detalhes de automação), e confirmei cada etapa tanto pela
  UI quanto por consulta direta a `/api/account` no servidor: cadastro →
  compra → pagamento simulado → login → ativar → baixar (conteúdo
  confirmado byte-a-byte) → desautorizar (vaga liberada, confirmado
  `devices: []`).
- **Bug real encontrado durante esse teste manual**: a lista da biblioteca
  perdia a seleção sempre que o heartbeat de 5s redesenhava a lista
  (`LB_RESETCONTENT`) com um item selecionado. Corrigido em
  `renderLibraryList()` (identifica o item por `product`+`release`+`isWire`
  antes do reset, restaura a seleção correspondente depois). Confirmado
  corrigido repetindo o teste manual com uma espera deliberada de 6s
  atravessando um tick do heartbeat.
- **`manager/package.ps1` atualizado** para compilar e empacotar
  `Plugnex.exe` (via `reconstructed/plugnex-app/build.ps1`) em vez do
  antigo `Mizin Wire.exe` em C# — o nome do ZIP gerado (`Plugnex-App-<hash>.zip`)
  agora bate com o que `server.mjs` espera em `managerFile`. **Atenção**:
  `package.ps1` sempre exigiu PowerShell 7 (usa `[Convert]::ToHexString`);
  esta máquina só tem PowerShell 5.1 instalado, então não consegui rodar
  `package.ps1` de ponta a ponta nesta sessão — testei a parte que
  controlo (a chamada a `build.ps1`) isoladamente sob PS5.1 e funciona.
  Adicionei uma checagem explícita de versão no início do script com uma
  mensagem de erro clara, em vez de deixar falhar tarde com um erro confuso
  de método ausente.

## Continuação na mesma sessão: reconstrução visual "Graphite"

Logo depois do que está descrito acima, o usuário apontou para
`targets/mizin_licencas/visual/` (um protótipo HTML/CSS/JS pré-existente,
"PLUGNEX Graphite Edition", com capturas de tela de referência em
`visual/extracted/PLUGNEX_Graphite/reference/`) e pediu para o app nativo
seguir esse visual. Perguntei ao usuário o escopo (5 abas completas vs. um
subconjunto) e ele escolheu as 5 abas completas (Discover, My Plugins,
Updates, Licenses, Settings).

### O que mudou

- `main.cpp` foi reescrito do zero como shell owner-drawn (GDI+) seguindo o
  layout do protótipo pixel a pixel (métricas de `design-tokens.json` e do
  CSS do `plugnex.html`): header 43px, menu 29px, abas 45px, toolbar 48px,
  shell de 3 painéis (sidebar 210px / tabela flexível / inspector 350px),
  footer 28px. Toda a lógica de backend (`httpclient.h`, `crypto.h`,
  `profile.h`, `osc.h`) ficou **intacta** — só a camada de desenho mudou.
- Novos arquivos `src/theme.h` (tokens de cor/fonte exatos do kit) e
  `src/icons.h` (glifos genéricos App/Plugin/Wire — **não** tentei recriar
  os ícones ilustrativos de produtos fictícios do protótipo como "Web
  Arena"/"SRT Receiver", já que nosso catálogo tem produtos reais
  diferentes; um glifo por categoria é honesto, inventar um ícone
  específico por produto não seria).
- Logo horizontal PLUGNEX real embutido como recurso `RCDATA`
  (`resources/logo-horizontal.png`, copiado de
  `public/assets/brand/02_Logos/plugnex-horizontal-color.png`) e decodificado
  via GDI+ — substitui o que antes era só texto "PLUGNEX".
- `catalog_logic.h` ganhou `buildStoreOffers()` e `computeInstallState()`
  (mais `InstallState` enum), testados em `test_catalog_logic.cpp` contra
  as mesmas fixtures reais já existentes — 30 asserções, todas passando.

### Dois bugs reais encontrados e corrigidos durante o teste manual desta parte

1. **Esqueci de criar os controles de login.** Depois de reconstruir a UI,
   percebi (olhando a própria captura de tela que tirei) que a aba Settings
   não tinha nenhum campo de e-mail/senha nem botão — só texto estático.
   O app ficou sem nenhuma forma de autenticar. Corrigido adicionando
   controles `EDIT`/`BUTTON` nativos reais (login, senha, porta OSC, busca)
   posicionados por uma função `layoutControls()` que espelha exatamente a
   matemática de layout do `paint()`, mostrados/escondidos conforme a aba e
   o estado de login.
2. **Corrida de dados real, causando crash silencioso.** Ao testar o login
   pela UI de verdade (preenchendo os campos e clicando em Entrar via
   mensagens Win32), o processo morria sem aviso logo depois do clique —
   sem nada no Visualizador de Eventos do Windows. Investigando
   metodicamente (isolando cada mensagem Win32 enviada, uma de cada vez),
   encontrei a causa: `rebuildRows()` (disparado pelo próprio login, numa
   thread de trabalho) reescrevia `app->rows` enquanto `paint()`, na thread
   da UI, podia estar no meio de uma leitura do mesmo vetor — sem nenhum
   mutex protegendo isso. O mesmo valia para `catalog`, `signedIn`,
   `currentEmail` e as chaves públicas. Corrigido com um novo
   `AppState::modelMutex` e métodos `snapshot*()` que copiam o dado sob o
   lock; `paint()` agora tira um único snapshot no início do frame inteiro
   em vez de reler o estado compartilhado em pontos diferentes do desenho.
   Confirmado corrigido reproduzindo o cenário exato do crash várias vezes
   e com um teste de estresse (dezenas de cliques rápidos de troca de aba +
   refresh em sequência). Ver seção "Concorrência" no
   [README do app](../reconstructed/plugnex-app/README.md#concorrência)
   para os detalhes técnicos completos.

### Validação desta parte

- `test_catalog_logic.exe`: 30/30 (incluindo os 9 novos casos de
  `buildStoreOffers`/`computeInstallState`).
- Build limpo com `/W4`, zero warnings.
- Teste manual completo contra servidor real isolado: login pela tela de
  Settings → navegação pelas 5 abas → seleção de linha em My Plugins →
  clique em Activate no inspector → confirmado por captura de tela **e**
  por consulta a `/api/account` (dispositivo `DESKTOP-BBB9G7I` realmente
  registrado na licença `playout`).

## Terceira rodada: idioma, corte de texto e estilo dos botões

O usuário mandou várias capturas de tela da interface Graphite rodando de
verdade e pediu três coisas: corrigir erros de idioma, corrigir corte nas
escritas, e melhorar os botões (que apareciam cinza-claro padrão do Windows,
destoando do tema escuro). Ver a lista completa em
[`CHANGELOG.md`](../CHANGELOG.md#v042-build-0007---2026-11-25) (entrada
v0.4.2); aqui vai o raciocínio por trás da causa raiz, que não era óbvia.

### Causa raiz do texto corrompido: faltava `/utf-8` no `cl.exe`

O código-fonte (`main.cpp`) sempre foi salvo em UTF-8, com literais como
`L"Configurações"`. Mas `build.ps1` nunca passou `/utf-8` para o `cl.exe`,
então o compilador interpretava os bytes UTF-8 do arquivo usando a
codificação padrão do console (geralmente Windows-1252 no Brasil), e cada
caractere acentuado virava um literal de **dois caracteres corrompidos**
(dupla-codificação: `ç` virava `Ã§`). Isso é diferente de um simples
"esqueci o acento" — mesmo os textos que eu "escrevia certo" no código
saíam errados na tela. Confirmado isolando o problema: compilei um `.cpp`
mínimo com uma string acentuada, uma vez com `/utf-8` e outra sem, e
comparei os bytes UTF-8 reais que cada binário produzia em tempo de
execução -- só a versão com a flag batia com o texto original.

### Causa raiz dos campos "brancos": não era cor, era borda

Depois de adicionar `WM_CTLCOLOREDIT` para pintar os campos de
e-mail/senha/porta/busca com o fundo escuro do tema, a captura de tela
ainda mostrava os campos aparentemente brancos. Depurei isso
metodicamente: adicionei um log temporário dentro do handler (confirmou
que ele *era* chamado, com o pincel correto), depois fiz amostragem de
pixel na própria captura de tela (`Bitmap.GetPixel`) no meio do campo --
e o pixel já era exatamente `#1B1D20`, a cor certa. O "branco" era só a
borda do estilo `WS_EX_CLIENTEDGE` (o rebaixo 3D clássico do Windows), que
sempre desenha uma faixa de destaque clara em dois lados do controle
*independente* da cor que `WM_CTLCOLOREDIT` devolve -- isso é um
comportamento documentado do Windows, não um bug meu, mas não é óbvio até
você isolar e testar. Troquei por `WS_BORDER` simples, que usa a mesma cor
do preenchimento.

Lição para quem for mexer nisso de novo: **amostragem de pixel direto na
captura de tela** foi o que resolveu o impasse -- muito mais confiável do
que confiar no "parece branco" de uma captura em miniatura.

### Validação

- `test_catalog_logic.exe` e os outros três continuam 100% passando (essa
  rodada só mexeu em apresentação, não em lógica).
- Build limpo com `/W4`, zero warnings.
- Testado manualmente: login real pela tela de Configurações, navegação,
  zoom em capturas de tela para confirmar pixel a pixel que a borda ficou
  escura, redimensionamento forçado da janela abaixo do mínimo
  (`SetWindowPos` para 400×300) confirmando que o Windows respeita o limite
  de 1040×640 definido em `WM_GETMINMAXINFO`.

## Pendente / próximos passos sugeridos

1. **Testar `manager/package.ps1` de ponta a ponta com PowerShell 7
   instalado** (ou instalar `pwsh` nesta máquina, com autorização do
   usuário) — a lógica de empacotamento em si não foi exercida
   end-to-end, só a parte de compilação do `.exe`.
2. **`plugnex.pages.dev` não tem backend ainda.** O domínio hoje seria
   Cloudflare Pages (Workers), que não hospeda o `server.mjs` atual
   (SQLite nativo + `child_process.spawn` para `Wire.exe`/PowerShell). Para
   o site valer de fato nesse domínio, alguém precisa decidir: (a) hospedar
   `server.mjs` em outro lugar (VM, container) e apontar `plugnex.pages.dev`
   para lá via proxy/DNS, ou (b) portar a lógica para o modelo de Workers
   (reescrita grande, perderia SQLite nativo e o `spawn` do compilador
   Wire). Isso não foi decidido nesta sessão — fica como decisão do
   usuário.
3. Instalador (`.msi` ou NSIS/Inno Setup) para `Plugnex.exe` ainda não
   existe — hoje é só o `.exe` + ícone, distribuído em ZIP solto via
   `package.ps1`.
4. Os ícones/PNGs do kit de marca (`03_Icones/`) foram copiados mas não
   todos os tamanhos foram testados visualmente em Explorer/taskbar em
   diferentes DPIs — só o 32x32 (extraído via `System.Drawing.Icon` nesta
   sessão) foi verificado.
