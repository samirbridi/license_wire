# Escopo confirmado

- Lightroom Classic no Windows; uso proprio primeiro.
- Maquina de edicao distinta do desenvolvimento, na mesma LAN.
- Endpoint fornecido: 192.168.1.58. Leitura de arquivos do Lightroom/Neurapix e pesquisa autorizadas pelo pedido; nao inferir autorizacao para modificar acervo, trocar licenca, enviar dados ou instalar servicos remotos.
- Preservar fotos e edicoes; separar os trabalhos usados no treino dos usados na validacao.
- Implementacao independente. Se forem recebidos binarios originais do Neurapix para estudo, criar alvo separado targets/neurapix com proveniencia e SHA-256.
- Caminhos confirmados pelo usuario: catalogos em `D:\LR CATALOGOS`, perfil em `C:\Users\Cris Bridi`. Leitura SMB comprovada em `\\192.168.1.58\LR CATALOGOS`; alias `LRCatalogos` ainda negado. Nao precisa corrigir esse alias para prosseguir.
- Depois de fechado o Lightroom pelo usuario: snapshot privado de vinte arquivos, hashes conferidos, fontes estaveis e sem escrita. Cópia SQLite integra e sem alteracoes durante a analise.
- Extraidos 3.601 exemplos atuais com historico Neurapix em oito raizes de trabalhos. O usuario confirmou revisao e aprovacao das edicoes de outubro. Essa aprovacao foi registrada como evidencia humana, nunca inferida do historico.
- Pendente: versao do Lightroom, GPU/RAM, acesso aos RAWs fora da pasta de catalogos, renderizacoes de entrada e treino/QA. Nao e necessario compartilhar o perfil inteiro para a coleta.

Nao e necessario exportar o SmartPreset proprietario para tentar aprender com RAWs e parametros finais do usuario. A existencia desses pares e sua cobertura precisam ser verificadas.

