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
- Motor local portatil implementado para a selecao atual, com diagnostico, resultados e cancelamento. Quatro RAWs reais processados, incluindo um fora das 546 referencias; paridade de dominio/predicoes conferida. Depois dos testes Lua 5.1, o usuario confirmou o diagnostico e a analise de cinco fotos sem falhas no Lightroom 15.6, build 0008.
- No primeiro retorno nativo ainda faltava o JSON completo da tarefa; permanecem pendentes atributos de varios trabalhos, validacao independente entre eventos, aprovacao visual, gestao de estilos e aplicacao reversivel. A amostra exibida tem diferencas relevantes de temperatura. O modelo nao foi retreinado nesta etapa.
- O JSON completo depois foi lido: cinco fotos em 5,31 s, 50 parametros atuais correspondentes ao snapshot, modelo entregue identificado pelo hash relatado e cinco hashes RAW fora do dataset original. Matiz e temperatura requerem melhoria de aprendizado; nao faltaram atributos na execucao.
- Coleta local de referencias aprovadas implementada para reunir atributos/parametros de outros trabalhos sem mover RAWs pela rede. Treinamento/ativacao de uma nova revisao permanecem pendentes; a aprovacao da selecao e registrada pelo proprio fluxo do coletor.

Nao e necessario exportar o SmartPreset proprietario para tentar aprender com RAWs e parametros finais do usuario. A existencia desses pares e sua cobertura precisam ser verificadas.

