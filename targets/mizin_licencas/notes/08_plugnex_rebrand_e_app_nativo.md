# PLUGNEX: rebrand e app nativo Windows (sessão de 2026-11-25)

> Continuidade para quem pegar este alvo depois. Resumo do que foi feito,
> por quê, e o que ficou pendente. Ver também [`CHANGELOG.md`](../CHANGELOG.md#v040-build-0005---2026-11-25)
> para a lista formal de mudanças por categoria.

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
