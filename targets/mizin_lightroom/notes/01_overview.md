# Escopo confirmado

- Lightroom Classic no Windows; uso proprio primeiro.
- Maquina de edicao distinta do desenvolvimento, na mesma LAN.
- Endpoint fornecido: 192.168.1.58. Leitura de arquivos do Lightroom/Neurapix e pesquisa autorizadas pelo pedido; nao inferir autorizacao para modificar acervo, trocar licenca, enviar dados ou instalar servicos remotos.
- Preservar fotos e edicoes; separar os trabalhos usados no treino dos usados na validacao.
- Implementacao independente. Se forem recebidos binarios originais do Neurapix para estudo, criar alvo separado targets/neurapix com proveniencia e SHA-256.
- Caminhos confirmados pelo usuario: catalogos em `D:\LR CATALOGOS`, perfil em `C:\Users\Cris Bridi`. Leitura SMB comprovada em `\\192.168.1.58\LR CATALOGOS`; alias `LRCatalogos` ainda negado. Nao precisa corrigir esse alias para prosseguir.
- Depois de fechado o Lightroom pelo usuario: snapshot privado de vinte arquivos, hashes conferidos, fontes estaveis e sem escrita. Cópia SQLite integra e sem alteracoes durante a analise.
- Extraidos 3.601 exemplos atuais com historico Neurapix em oito raizes de trabalhos. O usuario confirmou revisao e aprovacao das edicoes de outubro. Essa aprovacao foi registrada como evidencia humana, nunca inferida do historico.
- RAWs do primeiro trabalho adquiridos por compartilhamento direto confirmado: 546 pares com camera/captura e hashes verificados; entradas tecnicas locais LibRaw e modelo numerico experimental criados. Nao houve escrita nas fontes nem upload de fotos.
- Uma extensao Lua de comparacao de previsoes salvas foi preparada em modo de leitura. Depois dos testes Lua 5.1 com doubles de SDK, o usuario mostrou o fluxo nominal funcionando no Lightroom: menu, dialogo, 92/92 fotos localizadas e cinco exemplos exibidos. Os 30 valores arredondados visiveis correspondem aos registros atuais/previsoes salvos. Ver `evidence/native-read-user-qa-20261029.json`.
- Foram mapeadas as sete opcoes de menu observadas no Neurapix e sua adaptacao ao processamento local. O planejamento esta em `09_qa_nativo_e_modulos.md`; as funcoes futuras ainda nao fazem parte do pacote de leitura.
- Pendente: versao real do Lightroom, GPU/RAM da maquina de edicao, pixels dos outros trabalhos, validacao entre eventos, aprovacao visual e integracao do motor para novas fotos/aplicacao reversivel.

Nao e necessario exportar o SmartPreset proprietario para tentar aprender com RAWs e parametros finais do usuario. A existencia desses pares e sua cobertura precisam ser verificadas.

