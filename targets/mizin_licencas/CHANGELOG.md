# Changelog da Central de Licenças PLUGNEX (ex-Mizin)

## v0.4.2 (build 0007) - 2026-11-25

### 🐛 Fixes

- fix: adiciona a flag `/utf-8` ao `cl.exe` em `build.ps1` -- sem ela, todo literal com acento ou caractere especial (↻, ·, —, ⋯) no código-fonte UTF-8 era interpretado com a codificação do console e saía corrompido na tela (ex.: "Configurações" virava "ConfiguraÃ§Ãμes"). Causa raiz confirmada compilando um programa mínimo com e sem a flag e comparando os bytes UTF-8 reais produzidos por cada um.
- fix: traduz para português todo o texto da interface do `Plugnex.exe` que ainda estava em inglês (nomes das abas, cabeçalhos de coluna, rótulos do inspector, mensagens de status) e corrige a acentuação de todo o texto que já estava em português mas tinha sido escrito sem acento por engano antes da correção acima existir -- usa o mesmo vocabulário já estabelecido no portal web (`public/app.js`/`user.js`): "Minhas licenças", "Liberar"/"Ativar nesta máquina", "vagas".
- fix: campos nativos de e-mail/senha/porta OSC/busca apareciam com uma faixa branca de destaque (estilo `WS_EX_CLIENTEDGE`, o rebaixo 3D clássico do Windows) mesmo com a cor de fundo já correta via `WM_CTLCOLOREDIT` -- confirmado por amostragem de pixel que o preenchimento já estava certo e só a borda do estilo "sunken" ficava branca/cinza-clara independente da cor devolvida pelo handler. Trocado por `WS_BORDER` simples, que usa a mesma cor do preenchimento.
- fix: botões nativos "Entrar"/"Sair da conta"/"Salvar porta" apareciam cinza-claro padrão do Windows, destoando do resto da tela desenhada à mão -- adicionado `BS_OWNERDRAW` + handler `WM_DRAWITEM` para pintá-los no tema Graphite (fundo azul de destaque para "Entrar", cinza-escuro para os demais).
- fix: largura das colunas da tabela (Plugin/Versão/Situação/Ação) redistribuída -- o texto de ação mais longo ("Ativar nesta máquina", "Desautorizar máquina") estava sendo cortado pela largura fixa da coluna.
- fix: texto "Conta: &lt;e-mail&gt;" na aba Configurações sobrepunha o botão "Sair da conta" com e-mails mais longos -- botão afastado e o texto do e-mail ganhou reticências em vez de invadir o espaço do botão.
- fix: adiciona tamanho mínimo de janela (`WM_GETMINMAXINFO`, 1040×640) -- sem isso, redimensionar a janela para um tamanho pequeno cortava os controles nativos da aba Configurações contra a borda da janela.

## v0.4.1 (build 0006) - 2026-11-25

### 💥 Breaking Changes

- break: reconstrói a interface de `Plugnex.exe` do zero para seguir o visual "Graphite Edition" aprovado (`targets/mizin_licencas/visual/plugnex.html`) — remove o shell de controles Win32 simples (ListBox/Button nativos) em favor de um shell owner-drawn (GDI+) com 5 abas (Discover, My Plugins, Updates, Licenses, Settings) sobre layout de 3 painéis. Toda a lógica de backend (HTTP, criptografia, perfil local, OSC) permanece a mesma; apenas a camada de apresentação mudou.

### ✨ Features

- feat: adiciona `src/theme.h` (tokens de cor/fonte/métrica extraídos do design-tokens.json do kit Graphite) e `src/icons.h` (glifos genéricos de categoria App/Plugin/Wire desenhados em GDI+, sem reaproveitar os ícones ilustrativos de produtos fictícios do protótipo).
- feat: embute o logotipo horizontal PLUGNEX real como recurso `RCDATA` (`resources/logo-horizontal.png`) e o decodifica via GDI+ no cabeçalho do app, substituindo o selo de texto da versão anterior.
- feat: adiciona os controles nativos de login (e-mail, senha, botão Entrar/Sair) e configuração de porta OSC na aba Settings — a versão anterior desta sessão havia esquecido de criar esses controles, deixando o app sem nenhuma forma de autenticar.
- feat: unifica a visualização de Discover/My Plugins/Updates/Licenses numa única estrutura de dados (`Row`) que combina catálogo, posse e estado de ativação local, com filtro por categoria (Sources/Plugins/Wire) e busca textual.

### 🐛 Fixes

- fix: corrige uma corrida de dados real (`app->rows`, `app->catalog`, `app->signedIn`, `app->currentEmail` e as chaves públicas Ed25519/Wire eram lidos por `paint()`/pelo heartbeat e escritos por threads de trabalho sem nenhuma sincronização) que derrubava o processo silenciosamente logo após o login — encontrada ao testar manualmente a nova interface. Corrigida com um mutex dedicado (`AppState::modelMutex`) e acessores `snapshot*()` usados por todo leitor/escritor desses campos; confirmada a correção reproduzindo o cenário exato do crash e com um teste de estresse de cliques repetidos.

### ⚡ Improvements

- improve: `build.ps1` agora linka `gdiplus.lib` e `resources/app.rc` inclui o novo recurso do logo.

## v0.4.0 (build 0005) - 2026-11-25

### 💥 Breaking Changes

- break: renomeia a marca de Mizin para **PLUGNEX** em todo o portal web (`public/`), incluindo título, logo, textos de UI, nome do ZIP do gerenciador (`mizin-wire.zip` → `plugnex-app.zip`) e mensagens de erro vindas do backend. URLs de API e o campo `scope` interno dos tokens Wire (`"mizin-wire"`) foram mantidos por compatibilidade com clientes já emitidos.

### ✨ Features

- feat: aplica o kit de marca PLUGNEX (`public/assets/brand/`) — logos SVG/PNG, paleta de tokens (`#0A0B1E`/`#2F6BFF`/`#00E5FF`/`#A855FF`), favicon e ícone do app — e reescreve `public/style.css` com os tokens do manual de identidade visual.
- feat: adiciona rota estática `/assets/brand/*` em `server.mjs` com proteção contra path traversal, para servir os ativos de marca.
- feat: adiciona rota `POST /api/download` para plugins diretos (DLL), espelhando as mesmas checagens de posse de licença e vaga ativa já usadas por `/api/wire/download`.
- feat: cria o app nativo Windows **Plugnex.exe** (C++17/Win32, sem dependência de .NET) em `reconstructed/plugnex-app/` — sucessor funcional do Gerenciador Mizin Wire (C#), estendido para cobrir compras DLL além de Wire:
  - Login/logout, biblioteca unificada (DLL + Wire), ativação/desautorização de máquina, download autenticado com diálogo nativo "Salvar como".
  - Verificação offline de assinatura reimplementada em C++ nativo: Ed25519 (`vendor/ed25519`, domínio público) para tokens diretos e ECDSA P-256 via CNG para provas Wire — mesmo protocolo de `licensing.mjs`/`wire-manager.mjs`, verificado matematicamente no cliente.
  - Perfil local criptografado via DPAPI (`CryptProtectData`/`CurrentUser`), heartbeat OSC byte-compatível com o gerador original em C#.
  - Quatro suítes de teste standalone (`test/test_crypto.cpp`, `test_profile.cpp`, `test_osc.cpp`, `test_catalog_logic.cpp`) validadas contra tokens e respostas de API reais, não mocks.

### 🐛 Fixes

- fix: restaura `settle()` e `verifyOffline()` em `licensing.mjs` — haviam sido removidos numa edição anterior desta sessão, quebrando `server.mjs`, `payments.mjs` e toda a suíte de testes em runtime.
- fix: corrige `ReferenceError` em `submissions.mjs` (`cat.products.map(p=>x.id)` usava variável inexistente `x`), que quebrava o endpoint de aprovação de submissões de terceiros.
- fix: `renderLibraryList()` no app nativo agora preserva a seleção da lista de biblioteca entre redesenhos periódicos do heartbeat (antes, `LB_RESETCONTENT` a cada 5s descartava a seleção do usuário).

### ⚡ Improvements

- improve: `server.mjs` agora distingue `Content-Type` de texto (`charset=utf-8`) de binário (PNG/ICO) ao servir os ativos estáticos — antes todos os tipos recebiam `; charset=utf-8` incondicionalmente.
- improve: `httpclient.h` converte `Set-Cookie` para UTF-8 corretamente (antes truncava `wchar_t` para `char` byte a byte, perdendo o byte alto de qualquer caractere não-ASCII).

## v0.3.1 (build 0004) - 2026-11-22

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- Nenhum.

### 🐛 Fixes

- fix: preserva cartões vizinhos ao desenhar o catálogo nativo (commit `bd2f880699c878447b2de059eb2799444d471d73`)

### ⚡ Improvements

- Nenhum.

## v0.3.0 (build 0003) - 2026-11-22

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: adiciona catálogo ao painel e compila edições Wire para a loja (commit `b4e8ad8c1c7227e41e863552a43f7097cbb736c8`)

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- Nenhum.

## v0.2.0 (build 0002) - 2026-11-22

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: integra gerenciador Windows e compras Wire à central Mizin (commit `2db2ace848a1753c028dfa097168bda569dd3217`)

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- Nenhum.

## v0.1.0 (build 0001) - 2026-11-22

### 💥 Breaking Changes

- Nenhum.

### ✨ Features

- feat: cria central de compra e ativação de licenças Mizin (commit `a15f39a0ac5f50440e576561ad2f26717adf2d28`)

### 🐛 Fixes

- Nenhum.

### ⚡ Improvements

- Nenhum.

Histórico de entregas calculado pelos commits deste alvo.
