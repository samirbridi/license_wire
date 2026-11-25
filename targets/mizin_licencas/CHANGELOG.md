# Changelog da Central de Licenças PLUGNEX (ex-Mizin)

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
