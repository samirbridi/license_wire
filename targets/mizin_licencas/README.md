# Central de licenças PLUGNEX

> **Versão da plataforma**: `v0.4.0 (build 0005)`
> Marca anterior: Mizin. O backend, o banco de dados e os identificadores de API (rotas, o campo `scope:"mizin-wire"` dentro dos tokens Wire assinados) permanecem como estavam para não invalidar licenças/tokens já emitidos — apenas a marca visível ao usuário (site, app, nomes de arquivo) foi renomeada. Ver [CHANGELOG.md](CHANGELOG.md#v040-build-0005---2026-11-25).

Loja e portal do cliente para programas e plugins próprios. A mesma conta reúne pedidos, seriais, máquinas e direitos de atualização. Cada site de produto pode direcionar o comprador para `/?produto=playout`, por exemplo.

Além do portal web, há um **app nativo para Windows** (`Plugnex.exe`, C++/Win32) em [`reconstructed/plugnex-app/`](reconstructed/plugnex-app/README.md) que permite ao usuário entrar na conta, ver a biblioteca de plugins comprados (DLL e Wire), autorizar/desautorizar a máquina atual e baixar os builds — sucessor funcional do antigo Gerenciador Mizin Wire (`manager/Manager.cs`), agora cobrindo também produtos DLL.

## Executar e testar

Use Node.js 24.18 ou compatível com SQLite integrado. A partir da raiz do repositório:

```powershell
Set-Location targets/mizin_licencas
node --test
node server.mjs
```

Abra [a loja local](http://127.0.0.1:4381). Crie uma conta de teste, configure o número de máquinas e confirme o pagamento simulado. Em **Minhas licenças** aparecem o serial e as regras de cada item. A simulação só funciona em loopback. Pedidos, contas, sessões e chaves persistem em `runtime/`, fora do Git.

## Configurar a oferta

Edite `catalog.json` ou selecione outro arquivo com `LICENSE_CATALOG`. Os valores fornecidos são exemplos de homologação. Preços e renovação são expressos em centavos de real. `tiers` contém faixas crescentes de quantidade, começando em uma unidade. O desconto incide sobre a quantidade comprada naquela operação. Os identificadores de produtos e ofertas são estáveis.

Cada produto define `terms` em meses ou `null` para atualizações sem prazo. A compra congela essa política para cada item do pacote. Ao renovar, a cobertura avança a partir do vencimento ou da data atual, a que for posterior. Comprar máquinas mantém o vencimento existente. Os builds têm identificadores imutáveis e datas de lançamento UTC no catálogo do servidor. Preserve as entradas antigas para permitir reinstalações.

## Checkout

O adaptador inicial usa Stripe Checkout. Configure `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` e `LICENSE_ORIGIN` no ambiente do processo. Cadastre `/api/stripe/webhook` para os eventos `checkout.session.completed` e `checkout.session.async_payment_succeeded`. A emissão exige assinatura válida, pagamento confirmado, ambiente, valor e moeda compatíveis. Eventos repetidos recuperam o serial existente. O redirecionamento do navegador apenas consulta o estado.

Produção usa um catálogo comercial explícito, origem HTTPS e banco próprio. O processo escuta em loopback, atrás de proxy reverso que preserve o Host. `PORT` e `LICENSE_DATA` configuram a porta e o diretório de dados. Proteja e faça backup consistente do banco SQLite, incluindo a chave de assinatura. Os clientes devem fixar a chave pública do ambiente na distribuição.

## Estado Atual e Próximos Passos

A homologação cobre cadastro, login, compra de programas e pacotes, máquinas, renovação de atualizações, confirmação de pagamento e API de ativação. O teste HTTP usa armazenamento temporário e reinicia o servidor para verificar persistência. O adaptador Stripe foi testado com eventos sintéticos. Antes da abertura comercial, faltam a homologação com a conta do vendedor, o catálogo definitivo, recuperação de conta, tratamento de estornos e hospedagem.

O app PLUGNEX para Windows (`Plugnex.exe`) permite entrar com a conta da loja, ver a biblioteca de plugins comprados (DLL e Wire, numa lista só), ativar/desautorizar a máquina atual e baixar o build correspondente. O catálogo de demonstração usa o ID histórico `outliner` para o Mizin Outliner. O build de homologação entrega um efeito de teste da marca-d’água. O produto comercial completo ainda precisa incorporar a integração. Os aplicativos e as DLLs conservam a ativação por serial.

Com a loja local em execução, gere o pacote da mesma origem e chave com PowerShell 7 em Windows e Wire instalados (o app em si compila com MSVC/`cl.exe`, não precisa mais de .NET Framework):

```powershell
.\manager\package.ps1 -IncludeTestEffect
```

`package.ps1` exige PowerShell 7+ (`pwsh`) por usar `[Convert]::ToHexString`, indisponível no Windows PowerShell 5.1 — o script verifica isso explicitamente e orienta a alternativa. Se só houver PowerShell 5.1 disponível, compile o app diretamente com `.\reconstructed\plugnex-app\build.ps1 -Origin <origem>` (sem o empacotamento em ZIP com o guia de uso).

A loja oferece o ZIP nas ofertas que incluem Wire e em Minhas licenças. Extraia e abra `Plugnex.exe`. O download do patch requer compra e máquina ativada. Para publicar outro build, coloque o arquivo autorizado em `LICENSE_DATA/wire-plugins/<produto>--<release>.cwired` (Wire) ou `LICENSE_DATA/dll-plugins/<produto>--<release>.zip` (DLL, servido por `/api/download`) e cadastre o identificador em `releases` e `wireReleases`. A arte de demonstração e os limites do transporte estão documentados no [estudo do Wire](notes/05_wire.md).

O contrato para os clientes está em [API de licenciamento](notes/03_protocols_apis.md). Para gerar a versão após um commit estruturado do alvo, execute `node scripts/version-from-commits.mjs --write`.

## Publicar um projeto Wire próprio

O Mizin Studio tem catálogo público com demos, biblioteca de compras e configurações de conta e conexão. Para homologação, Slice Refine Pro usa valores demonstrativos. A conta que comprou uma edição pode ativá-la na máquina e baixar o arquivo na biblioteca.

Em PowerShell 7, a partir deste alvo, a ferramenta recebe um projeto editável e o identificador do build cadastrado no catálogo:

```powershell
.\manager\compile-for-mizin.ps1 -Project '..\slice_refiner\reconstructed\Slice Refine Pro by Mizin\Slice Refine Pro by Mizin.wire' -Product slice-refine -Release studio-1
```

Cada saída de textura precisa ter um sinal de entrada. A compilação preserva o grafo e os recursos do autor, cria fontes temporárias ao lado do projeto para resolver recursos relativos e usa o compilador Wire instalado. As duas edições são publicadas juntas em `runtime/wire-releases/<produto>/<release>/`. Cada release é imutável. A demo recebe identidade própria e marca permanente. A edição comprada conserva a identidade do projeto original. Para substituir a demo em uma composição, selecione a edição comprada no host.

O servidor serve apenas a demo na rota pública. O download da edição comprada exige sessão, direito ao build e vaga ativa. O manifesto privado contém o canal da edição e os hashes dos artefatos. O gerenciador atualizado recebe o canal dentro da autorização assinada e envia pulsos locais enquanto a licença for válida. Um observador local que consiga reproduzir o sinal ainda pode simular a autorização visual da edição comprada. O sistema não reivindica resistência a cópia ou a replay dentro do host.

Para publicar o projeto de um autor externo (não a Mizin), siga o processo de teste e aprovação em [notes/07_submissao_terceiros_wire.md](notes/07_submissao_terceiros_wire.md) antes de cadastrá-lo no catálogo.
