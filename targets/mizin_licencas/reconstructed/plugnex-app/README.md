# PLUGNEX App — cliente nativo Windows (C++/Win32)

Sucessor funcional do antigo Gerenciador Mizin Wire (`manager/Manager.cs` +
`manager/ManagerPanel.cs`, C#/.NET Framework). Mesma ideia — app desktop que
fala com a central de licenças (`server.mjs`) e com o Resolume Wire/Arena —
estendida para cobrir compras de plugins **DLL** além de Wire, e reescrita em
C++/Win32 nativo (sem dependência de runtime .NET) para reduzir a superfície
de ataque e o tempo de inicialização.

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
  main.cpp         Shell Win32 (janela, controles, fluxo assíncrono) que liga tudo.
vendor/
  json.hpp               nlohmann/json v3.11.3 (single header, MIT).
  ed25519/               orlp/ed25519 (domínio público) — verify.c é o único caminho usado em produção.
resources/
  app.rc, plugnex.ico    Ícone e VERSIONINFO do executável.
test/
  test_crypto.cpp         Valida crypto.h contra tokens REAIS emitidos por licensing.mjs/wire-manager.mjs.
  test_profile.cpp        Round-trip DPAPI real (não mockado).
  test_osc.cpp             Compara o pacote OSC byte-a-byte contra uma reimplementação independente do original em C#.
  test_catalog_logic.cpp  Valida contra respostas REAIS de /api/catalog, /api/account, /api/wire/library.
build.ps1          Compila Plugnex.exe via MSVC (cl.exe), gerado por LICENSE_ORIGIN/VERSION do alvo.
```

Cada header em `src/` foi validado isoladamente em `test/` **antes** de
`main.cpp` ser escrito — a ordem foi: crypto → profile → osc → catalog_logic
→ só então a GUI. Todos os testes usam dados reais (tokens assinados pelo
`licensing.mjs`/`wire-manager.mjs` deste mesmo alvo, respostas reais de
`/api/*` capturadas de uma instância real do servidor), nunca mocks da
própria lógica sob teste.

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

Em 2026-11-25, contra uma instância isolada de `server.mjs` (porta de teste
dedicada, dados em diretório descartável): cadastro → compra → pagamento
simulado → login no app → ativar nesta máquina → baixar o build (conteúdo
confirmado byte-a-byte contra o artefato publicado) → desautorizar máquina.
Cada etapa foi confirmada tanto pela UI quanto por consulta direta a
`/api/account` no servidor. Ver notas de desenvolvimento para o passo a
passo completo.

## Pendências conhecidas

- Sem instalador (`.msi`/`.exe` de setup) ainda — hoje é o `.exe` solto mais
  o ícone embutido. Se for necessário um instalador com atalhos de
  Desktop/Menu Iniciar, isso é um passo adicional sobre o binário atual.
- `plugnex.pages.dev` precisa de um backend real atrás dele antes de um
  build apontando para esse domínio funcionar de fato (ver seção "Compilar").

### Corrigido durante a validação end-to-end

- A lista de biblioteca perdia a seleção (`LB_GETCURSEL` voltava a -1)
  sempre que o heartbeat de 5s redesenhava a lista (`LB_RESETCONTENT`)
  enquanto o usuário tinha um item selecionado — encontrado ao dirigir a GUI
  via Win32 messages durante o teste manual descrito abaixo. Não era um bug
  de segurança (nenhuma autorização era afetada), mas forçava reselecionar o
  item antes de Ativar/Baixar/Desautorizar se o heartbeat disparasse entre a
  seleção e o clique. `renderLibraryList()` agora identifica o item
  selecionado por `(product, release, isWire)` antes do reset e restaura a
  seleção correspondente depois de repovoar a lista.
