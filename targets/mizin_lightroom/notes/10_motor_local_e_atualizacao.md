# Motor local, pacote portatil e atualizacao

## Entrega funcional

O novo pacote calcula sugestoes para os RAWs selecionados no catalogo aberto. O menu tem quatro operacoes reais:

- **Analisar fotos selecionadas:** usa a selecao explicita, captura os ajustes atuais para comparacao e envia um pedido JSON ao motor local.
- **Ver ultimos resultados:** consulta o ultimo pedido iniciado, com valores por foto e acesso a pasta JSON/CSV.
- **Diagnosticar motor local:** verifica runtime, modelo, ExifTool e versao do Lightroom informada pelo SDK.
- **Comparar amostra salva do piloto:** conserva a comparacao anterior das 92 referencias, separada da inferencia nova.

O modelo e o mesmo piloto de regressao, com o mesmo treino e limitacoes. Este ciclo melhora o funcionamento do software; nao demonstra melhora de precisao fotografica nem equivalencia ao Neurapix. A interface mostra tres controles e o CSV registra os dez experimentais. Ainda nao ha aplicacao de ajustes, criacao de copias virtuais, previa de imagem editada, treino pelo menu ou varios estilos selecionaveis.

## Fluxo e limites

Lua le selecao/ajustes pelo SDK -> novo diretorio de tarefa nos dados do aplicativo -> request.json -> Python isolado incluido -> ExifTool e LibRaw locais -> modelo privado -> status.json, results.json e results.csv -> dialogo de revisao no Lightroom.

O piloto aceita 1 a 100 RAWs CR3 em cor da Canon EOS R6m2. Camera diferente, arquivo ausente e metadados invalidos aparecem por foto. O cliente exige uma foto explicitamente selecionada: `getTargetPhotos` sozinho pode representar o filmstrip inteiro. O cancelamento e verificado entre fotos; a leitura/decodificacao corrente pode precisar terminar. Tarefas repetidas nao sobrescrevem resultados antigos. O motor bloqueia escrita concorrente no RAW enquanto confere metadados, hash e decodifica.

Os ajustes comparados sao os valores capturados no inicio, pois o usuario pode continuar trabalhando durante o processamento. Os JPEGs input-*.jpg sao entradas tecnicas LibRaw, sem aplicacao das previsoes. O Lightroom continuara responsavel pela renderizacao final quando a etapa de escrita reversivel for implementada.

O JSON e tratado como dados, sem executar Lua do catalogo ou do motor. Caminhos de fotos ficam no pedido JSON e nao sao interpolados na linha de comando. Caminhos do executavel/tarefa com caracteres de expansao do shell sao recusados. O runtime usa `._pth` e `-I`, sem Python do sistema ou configuracao do usuario. O launcher Pythonw e o subprocesso ExifTool operam sem janela de console. Nao ha servidor HTTP, upload, servico instalado ou rotina automatica ao abrir o Lightroom.

## Dependencias e proveniencia

O runtime inclui Python 3.13.14 embeddable Windows x64, NumPy 2.3.5, rawpy 0.27.1 / LibRaw 0.22.1, Pillow 12.3.0 e ExifTool 13.60 com Perl incluido. Os pacotes Python e o arquivo Python embeddable foram comparados aos SHA-256 publicados pelos respectivos distribuidores. O ExifTool veio do download SourceForge vinculado pelo site oficial; seu hash registra integridade do arquivo recebido, sem afirmar assinatura do fornecedor.

Avisos/licencas recebidos sao preservados. O pacote inclui tambem o sdist oficial rawpy 0.27.1 com as fontes LibRaw e scripts de compilacao. `THIRD-PARTY.json` documenta fontes e hashes; o modelo e os dados pessoais continuam privados. O guia Adobe foi usado somente no desenvolvimento, fora do ZIP.

## QA executado

- 36 testes Python/Lua 5.1 aprovados: coleta existente, regressao, codec JSON, escapes Unicode, selecao explicita, pacote incompleto, limites, ausencia de escritas, cancelamento, integridade do modelo e falhas por foto.
- Quatro RAWs reais processados pelo runtime embeddable. Um RAW foi copiado somente para QA do compartilhamento ja autorizado; seu SHA-256 nao aparece nas 546 referencias de treino/teste e ele nao foi usado para retreinar.
- Tres JPEGs tecnicos identicos aos gerados no treino. Trinta valores calculados corresponderam exatamente aos mesmos coeficientes/atributos salvos, com diferenca numerica zero. Isso valida a consistencia da entrada e da matematica, nao qualidade fotografica.
- Comando Windows gerado pelo proprio Lua executado com Pythonw, espacos e `&` no caminho, PATH restrito ao Windows e PYTHONHOME/PYTHONPATH invalidos. O diagnostico carregou as dependencias incluidas e confirmou isolamento.
- RAWs preservados, sem escrita no catalogo ou envio de fotos. Recebimentos, pixels, pedidos e resultados individuais ficam em `private/qa/`; resumo em `evidence/local-engine-qa-20261029.json`.

O computador de desenvolvimento nao executa Lightroom Classic. A nova interface, progresso e comandos precisam ser confirmados no host real. O teste nativo anterior do comparador continua limitado ao build 0006. Nao foi usada essa evidencia antiga para aprovar a nova integracao.

## Instalacao na maquina de edicao

1. Fechar o Lightroom e extrair TODO o novo ZIP em uma pasta nova e permanente. Guardar a pasta antiga.
2. Abrir Arquivo > Gerenciador de plug-ins. Remover o cadastro do piloto antigo e adicionar a NOVA pasta `MizinLightroom.lrplugin`. Os pacotes usam o mesmo identificador. Preservar os arquivos recebidos e o acervo.
3. Em Biblioteca > Extras de plug-in, executar **Mizin: diagnosticar motor local**. Conferir a versao do novo pacote e o resultado do runtime. Erros indicam a pasta do bootstrap.log.
4. Selecionar inicialmente 1 a 5 RAWs CR3 em cor da Canon EOS R6m2 e executar **Mizin: analisar fotos selecionadas**.
5. Conferir os nomes e valores mostrados, abrir a pasta de resultados e testar **Mizin: ver ultimos resultados**. Registrar qualquer erro e, separadamente, a avaliacao fotografica futura.

## Comandos de reproducao

Dependencias oficiais baixadas em `private/tools/local-engine-downloads/`, com recibos SHA-256 e fontes. Preparar o staging preservado:

```powershell
python .\scripts\prepare_local_runtime.py --downloads .\private\tools\local-engine-downloads
python -m unittest discover -s .\scripts -p 'test_*.py' -v
```

Depois do commit de funcionalidade e da geracao automatica de versao, montar o pacote privado:

```powershell
node .\scripts\version-from-commits.mjs --write
python .\scripts\build_lightroom_local.py --runtime-base .\private\runtime\local-engine-base-abb72eb1 --model-folder .\private\raw-datasets\20261029T172842Z-c6cf2182\pilot-models\20261029T174242827221Z --dataset .\private\raw-datasets\20261029T172842Z-c6cf2182 --manifest .\private\snapshots\20261029-124518-192a6383\analysis\extraction-20261029T155812079523Z\candidate-settings.jsonl
```

Fontes primarias: [Adobe SDK](https://developer.adobe.com/lightroom-classic/), [guia Adobe usado](https://ioconsolerykerprodcdn.azureedge.net/static/installers/lr/sdk/2022/cross_platform/v13/doc/Lightroom%20Classic%20SDK%20Guide_1655133965.pdf), [Python embeddable](https://www.python.org/downloads/release/python-31314/), [ExifTool](https://exiftool.org/), [rawpy](https://pypi.org/project/rawpy/0.27.1/), [NumPy](https://pypi.org/project/numpy/2.3.5/), [Pillow](https://pypi.org/project/Pillow/12.3.0/).
