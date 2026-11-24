# Runbook: submissão e aprovação de plugins Wire de terceiros

> Processo operacional, sem código novo. Usa as ferramentas já existentes do alvo
> (`manager/compile-for-mizin.ps1`, `catalog.json`, testes de `test/`). Inspirado no
> padrão observado no JuiceBar (compilar → revisar → aprovar → publicar), mas sem
> nenhuma dependência do backend real do JuiceBar — tudo roda dentro da nossa própria
> plataforma. Ver [notes/06_juicebar_resolume_integration.md](06_juicebar_resolume_integration.md)
> para o que foi reversado do fluxo deles.

## Por que isso existe

`manager/compile-for-mizin.ps1` já aceita **qualquer** projeto `.wire`, inclusive de um
autor que não é a Mizin — ele só precisa de um `Product`/`Release` cadastrados no
catálogo. O que falta não é mecânica de compilação (essa já existe e é mais robusta
que a do JuiceBar: a nossa verifica a assinatura Ed25519/P-256 matematicamente offline;
o JuiceBar só grava um carimbo de 64 bytes em disco sem verificação criptográfica —
ver seção 1 de `06_juicebar_resolume_integration.md`). O que falta é o processo humano
em volta: quem manda o projeto, quem testa, e em que ponto ele entra no catálogo.

## Quando usar

Alguém de fora quer que o plugin Wire dele seja vendido pela nossa central de licenças
(`mizin_licencas`), com demo pública com marca d'água e edição licenciada liberada por
compra.

## Passo a passo

### 1. Recebimento
- Peça o projeto `.wire` original (não um `.wired`/`.cwired` já compilado — precisa do
  grafo editável para o `prepare-edition.mjs` poder inserir o circuito OSC/marca d'água).
- Confirme com o autor: nome de exibição do produto, preço sugerido, se é plugin único
  ou deveria compor um pacote, e se tem `terms` (meses de atualização) ou é perpétuo.
- Guarde o arquivo recebido fora do Git (ex.: em `runtime/`, que já está no
  `.gitignore` do alvo) — não versione o projeto de terceiro no repositório sem
  autorização explícita dele.

### 2. Teste local antes de cadastrar
Com a loja local rodando (`node server.mjs` a partir do alvo) e o Resolume Wire
instalado:

```powershell
.\manager\compile-for-mizin.ps1 -Project '<caminho para o .wire do autor>' -Product teste-temp -Release rev1
```

Isso só funciona se `teste-temp` já existir em `catalog.json`. Para um teste que não
deve aparecer na loja ainda, adicione uma entrada temporária em `products` com um id
descartável (ex.: `teste-temp`) e **não** a referencie em nenhuma `offer` — assim ela
não aparece no catálogo público (`GET /api/catalog`), mas o compilador consegue
localizar o produto.

Verifique manualmente, com o Resolume Wire/Arena aberto:
- A demo (`.../rev1/demo.cwired`) abre e mostra a marca d'água "MIZIN DEMO" de forma
  permanente (a edição demo nunca recebe o circuito OSC).
- A edição licenciada (`.../rev1/licensed.cwired`) abre, a marca d'água aparece
  inicialmente e desaparece em até ~5s quando o Gerenciador Mizin está rodando com uma
  licença ativa simulada (sandbox) enviando pulso OSC na porta configurada.
- Sem o Gerenciador rodando (ou com a licença revogada), a marca d'água volta a
  aparecer no licenciado em ~5s — é o comportamento esperado de "default bloqueado".
- Confira que o projeto do autor não foi alterado (`sourceSha256` no `manifest.json`
  gerado deve bater com o hash do `.wire` original).

Rode a suíte de testes do alvo para garantir que nada regrediu:

```powershell
node --test
```

### 3. Decisão
- **Aprovado**: remova a entrada `teste-temp`, siga para o passo 4 com o id definitivo.
- **Rejeitado**: descarte os artefatos de teste em `runtime/wire-releases/teste-temp/`
  e avise o autor o motivo (ex.: saída de textura sem conexão única, grafo com
  dependência de recurso ausente, resultado visual abaixo do esperado).

### 4. Cadastro definitivo no catálogo
Edite `catalog.json` à mão (é JSON simples, sem necessidade de script):
- Em `products`: adicione o produto com `id`, `name`, `kind`, `terms` e
  `wireReleases: ["<release>"]`. O campo `releases` é preenchido depois, na
  publicação (passo 5).
- Em `offers`: adicione a oferta com `price`/`renew`, ou inclua o `id` do produto em
  `items` de uma oferta existente (pacote).

Isso é o "aprovar para colocar na plataforma": a partir desse commit, o produto
aparece em `GET /api/catalog` e pode ser comprado.

### 5. Publicação do build real
Com o id definitivo cadastrado, rode a compilação de verdade:

```powershell
.\manager\compile-for-mizin.ps1 -Project '<caminho para o .wire do autor>' -Product <id-definitivo> -Release <release>
```

Depois, em `products.<id>.releases`, registre `"<release>": "<data ISO de hoje>"` —
esse é o campo que `wire-manager.mjs` usa para decidir se uma licença com `until`
ainda cobre esse build.

### 6. Changelog e versão
Siga a regra de versionamento do `AGENTS.md` (seção 4): comite com `feat: adiciona
plugin <nome> de <autor> ao catálogo`, e gere a entrada de `CHANGELOG.md`/`VERSION`
com:

```powershell
node scripts/version-from-commits.mjs --write
```

## O que este runbook não cobre (de propósito)

- **Login próprio para autores externos.** Não existe hoje; o autor manda o arquivo
  por fora (e-mail, link) e quem roda os passos acima é alguém da nossa equipe.
- **Fila/histórico de submissões.** Não há registro formal de "em teste" vs
  "aprovado" além do que este documento descreve manualmente. Se o volume de
  submissões crescer a ponto de precisar disso, o próximo passo natural é um
  rastreio leve (linha em uma tabela ou arquivo JSON com status), não um portal
  completo — ver opções descartadas na decisão deste runbook.
- **Qualquer integração com o backend real do JuiceBar.** Este fluxo não fala com
  `mango.get-juicebar.com` nem depende dele; o paralelo é só conceitual (o padrão
  "revisar antes de publicar"), não técnico.
