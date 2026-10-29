# Escopo confirmado

- Lightroom Classic no Windows; uso proprio primeiro.
- Maquina de edicao distinta do desenvolvimento, na mesma LAN.
- Endpoint fornecido: 192.168.1.58. Leitura de arquivos do Lightroom/Neurapix e pesquisa autorizadas pelo pedido; nao inferir autorizacao para modificar acervo, trocar licenca, enviar dados ou instalar servicos remotos.
- Preservar fotos e edicoes; separar os trabalhos usados no treino dos usados na validacao.
- Implementacao independente. Se forem recebidos binarios originais do Neurapix para estudo, criar alvo separado targets/neurapix com proveniencia e SHA-256.
- Pendente: caminhos reais, acesso ao perfil do editor, versao do Lightroom, GPU/RAM, RAWs, catalogo e exemplos aprovados.

Nao e necessario exportar o SmartPreset proprietario para tentar aprender com RAWs e parametros finais do usuario. A existencia desses pares e sua cobertura precisam ser verificadas.

