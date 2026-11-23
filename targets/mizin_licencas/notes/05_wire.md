# Integração do Wire com a Central Mizin

## O que o host oferece

O Wire agrupa um patch e seus recursos em um único arquivo compilado. A opção de compilação para Juicebar usa a licença emitida pelo Juicebar. A documentação examinada descreve distribuição comercial independente e não apresenta um ponto de integração para substituir o emissor dessa opção. [Compilação e distribuição](https://resolume.com/support/en/wire-saving-consolidating)

Um patch próprio recebe OSC, inclusive quando executado no Arena, onde passa a usar as preferências OSC do host. O teste usa as classes públicas OSC In, Read OSC, Attack Release, Less, Text Render e Video Mixer. [OSC no Wire](https://resolume.com/support/en/wire-osc) · [Integração com Arena e Avenue](https://resolume.com/support/wire-resolume-integration)

## Fluxo implementado

1. A loja registra o direito por produto. A lista `wireReleases` no catálogo identifica as versões que exigem conta. A edição DLL continua com sua versão de ativação direta.
2. O gerenciador Windows autentica com a conta da loja. A biblioteca retorna as compras e builds elegíveis, inclusive dentro de pacotes. Cada entrada identifica a licença sem expor o serial no gerenciador.
3. Ao ativar, o servidor reserva a vaga existente ou uma nova. O gerenciador valida uma assinatura P-256 com a chave pública fixada no seu executável. O documento identifica a licença, instalação, produto, build e vencimento. A autorização dura 30 dias. O perfil e a sessão usam DPAPI do Windows.
4. O download do arquivo compilado passa por uma verificação de conta, direito, build e máquina ativa. A opção Baixar plugin salva o arquivo no local escolhido pelo cliente.
5. Enquanto houver autorização válida, o gerenciador emite um pulso por segundo para o host na máquina local. O efeito de teste sobrepõe MIZIN DEMO ao vídeo de entrada e retorna à sobreposição após cerca de cinco segundos sem pulsos.

## Limite da homologação

A assinatura protege a decisão dentro do gerenciador. OSC é um transporte de controle sem autenticação de origem. A marca-d’água deste protótipo demonstra o comportamento visual e pode ser acionada por outro emissor OSC. O download autenticado também não impede a cópia posterior do arquivo. Para uma proteção comercial resistente à cópia, a decisão criptográfica precisará ser aplicada em um componente confiável no caminho de renderização, ou através de uma integração licenciada com o fornecedor.

A avaliação local separa os testes da compra e da API, do executável Windows e da saída do grafo no Wire. O teste do grafo usou a entrada do envelope na API pública do editor. A aceitação final requer a execução do arquivo compilado com o gerenciador e o OSC habilitado no Arena/Avenue. Não foram alterados plugins comerciais ou o runtime do Resolume.
