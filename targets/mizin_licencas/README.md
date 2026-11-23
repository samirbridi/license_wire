# Central de licenças Mizin

> **Versão da plataforma**: `v0.1.0 (build 0001)`

Loja e portal do cliente para programas e plugins próprios. A mesma conta reúne pedidos, seriais, máquinas e direitos de atualização. Cada site de produto pode direcionar o comprador para `/?produto=playout`, por exemplo.

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

O Gerenciador Mizin para Windows permite entrar com a conta da loja, ativar uma compra Wire e baixar a edição correspondente. O catálogo de demonstração usa o ID histórico `outliner` para o Mizin Outliner. O build de homologação entrega um efeito de teste da marca-d’água. O produto comercial completo ainda precisa incorporar a integração. Os aplicativos e as DLLs conservam a ativação por serial.

Com a loja local em execução, gere o pacote da mesma origem e chave com PowerShell 7 em Windows, .NET Framework e Wire instalados:

```powershell
.\manager\package.ps1 -IncludeTestEffect
```

A loja oferece o ZIP nas ofertas que incluem Wire e em Minhas licenças. Extraia e abra `Mizin Wire.exe`. O download do patch requer compra e máquina ativada. Para publicar outro build, coloque o arquivo autorizado em `LICENSE_DATA/wire-plugins/<produto>--<release>.cwired` e cadastre o identificador em `releases` e `wireReleases`. A arte de demonstração e os limites do transporte estão documentados no [estudo do Wire](notes/05_wire.md).

O contrato para os clientes está em [API de licenciamento](notes/03_protocols_apis.md). Para gerar a versão após um commit estruturado do alvo, execute `node scripts/version-from-commits.mjs --write`.
