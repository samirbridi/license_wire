# Edicao local em novas copias virtuais

Implementacao independente que permite visualizar as previsoes no renderizador Adobe. Nao usa codigo, pesos nem servicos do Neurapix. O pacote fornecido do fornecedor nao demonstrou conter o treinamento completo ou uma receita para reproduzir sua qualidade.

## Escopo

- Comando editar fotos em copias virtuais: 1 a 25 originais CR3 em cor da Canon EOS R6m2. Piloto de dez controles ou candidato local explicitamente escolhido. As previsoes sao validadas antes de criar copias.
- Exposure2012, Temperature, Tint, Contrast2012, Highlights2012, Shadows2012, Whites2012, Blacks2012, Saturation e Vibrance. WhiteBalance muda para Custom. Exposicao em centesimos, demais controles inteiros, com limites verificados.
- Opcional: quatro curvas, nome Custom e ate 14 campos numericos de tonalidade, constantes nas 3.513 referencias em cor aprovadas de oito trabalhos. A origem precisa oferecer os controles de tonalidade; os ausentes sao registrados e omitidos. CameraProfile, Look, ProcessVersion e ColorNoiseReduction da base descritiva nao sao aplicados.
- As copias herdam os ajustes existentes: perfil/Look, HSL, mascaras, cortes e lentes nao sao aprendidos por esta implementacao. Avaliar o aprendizado em fotos ainda nao editadas; herdar uma edicao pronta pode mascarar a limitacao do modelo. Nao existe prova de equivalencia fotografica com Neurapix.

## SDK e recuperacao

createVirtualCopies(copyName) opera a selecao atual, fora do write gate. Selecionamos e conferimos exatamente uma origem na Biblioteca, depois verificamos cada retorno: nova identidade, isVirtualCopy verdadeiro, mesmo caminho e masterPhoto correto. Nenhum original recebe applyDevelopSettings ou applyDevelopSnapshot. A colecao da sessao e criada em um gate e preenchida em gates posteriores.

Na Revelacao, createDevelopSnapshot(name,false) retorna booleano. O snapshotID e procurado no master, porque snapshots sao compartilhados com as copias. id_global e uma identidade diferente, para exclusao; nunca e usado para aplicar ou excluir snapshots. Nao removemos snapshots.

Antes de aplicar ha um registro ready com identidade da copia, snapshotID e hashes do estado anterior. A escrita e flush/close sao conferidos, e o arquivo e relido. Isso auxilia recuperacao de interrupcoes, sem prometer persistencia contra falta de energia. O snapshot no catalogo oferece uma segunda via de recuperacao.

As escritas de revelacao sao feitas no objeto da copia, sob write gate. Leitura posterior confere os controles aplicados, escopos preservados e hash dos ajustes da origem. Aliases de temperatura/tint/balanceamento sao tratados sem considerar esses aliases uma alteracao de HSL ou perfil. O hash completo do estado aplicado e registrado para recuperacao.

Restaurar ultima edicao das copias verifica catalogo, origem, copia e snapshot. Uma copia com alteracoes posteriores ao estado registrado fica intocada pela restauracao automatica, com motivo exibido e salvo. Restauracao e idempotente; so a ultima sessao tem atalho, e historicos anteriores permanecem no disco/catalogo. Falhas e cancelamentos nao apagam copias. O plugin nao chama saveMetadata; XMP automatico segue o Lightroom.

Aprendizado, analise e edicao usam bloqueios para impedir sobreposicao entre tarefas do plugin. Isso nao impede cliques ou alteracoes de outros plugins; verificacoes de catalogo, selecao e estado interrompem a tarefa quando detectam mudancas. Aguarde a tarefa concluir.

## Evidencias e limites

Reforco anterior a entrega: catalogo, selecao exata e hashes dos ajustes sao conferidos novamente dentro dos callbacks de gravacao, apos a espera pelo write gate. Testes simulam mudanca de selecao e edicao manual nesse intervalo para verificar que a aplicacao/restauracao nao prossegue. O primeiro build interno foi preservado sem distribuicao; a correcao e a recompilacao recebem a proxima versao calculada pelos commits.

Os testes Lua 5.1 usam doubles com contratos do SDK: bool de snapshot, snapshotID versus id_global, operacao sobre selecao, gates, identidade do master, journal anterior a revelacao, restauracao e alteracoes manuais. Nao sao execucao do Lightroom. O motor portatil e exercitado com RAW real no pacote final, mas o resultado visual e a aplicacao/restauracao no Lightroom 15.6 ainda precisam de confirmacao nativa.

Comandos reproduziveis (PowerShell, raiz do repositorio):

```powershell
& '.\targets\mizin_lightroom\private\runtime\raw-pipeline\Scripts\python.exe' -m unittest discover -s targets/mizin_lightroom/scripts -p 'test_*.py' -v
node targets/mizin_lightroom/scripts/version-from-commits.mjs --write
```

O segundo comando exige o alvo limpo e commits estruturados, e gera VERSION, changelog e recibo. O build usa exclusivamente essa versao calculada. Recibos de QA e entrega desta etapa ficam em evidence/editing-*.json.

Referencias consultadas: [guia SDK Adobe](https://developer.adobe.com/lightroom-classic/), [createVirtualCopies e selecao](https://community.adobe.com/questions-675/some-thoughts-questions-on-createvirtualcopies-lr5-943141), [metodos de snapshot e modulo Revelacao](https://community.adobe.com/bug-reports-674/p-sdk-document-lrphoto-snapshot-methods-663151), [identidades distintas dos snapshots](https://community.adobe.com/questions-675/lr-5-functions-methods-and-properties-not-in-lr-4-docs-943164), [snapshots compartilhados](https://community.adobe.com/feature-requests-676/p-implement-clear-snapshots-option-665681). Guia Adobe local preservado em private/tools/local-engine-downloads/Lightroom-SDK-guide.pdf; referencia Adobe de API consultada em espelho lrc.mcor.dev.
