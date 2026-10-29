# QA nativo e escopo dos modulos

Evidencia recebida em 2026-10-29: o usuario informou que instalou e executou o plugin e forneceu tres screenshots. O primeiro mostra nosso dialogo de comparacao; os demais mostram menus do Neurapix em Arquivo/Biblioteca > Extras de plug-in. Esse material e referencia de funcionamento e requisitos. Nao e codigo, modelo ou documentacao da arquitetura interna do Neurapix.

## Resultado do teste observado

O pacote de leitura entregue foi `v0.3.0 (build 0006)`. O menu aparece no Lightroom e o dialogo localizou 92 de 92 referencias, exibindo cinco fotos. Foram transcritos e comparados 15 valores atuais e 15 previsoes; todos correspondem aos registros locais na precisao exibida. O recibo e `evidence/native-read-user-qa-20261029.json`. Os tres originais foram copiados sem alteracao para uma pasta privada, com SHA-256 igual ao recebido. Hashes tambem constam em `binaries/SHA256SUMS.txt`.

Status: **fluxo nominal de leitura confirmado pelo usuario**. A janela nao mostra os valores atuais de todas as 92 fotos. Os numeros de versao do aplicativo e do plugin nao aparecem nos prints. O pacote esperado foi identificado por sua entrega, nomes do menu/dialogo e dados correspondentes. A evidencia nao aprova inferencia de fotos novas, escrita/restauracao ou qualidade fotografica das previsoes.

Ha diferencas relevantes nos exemplos: a exposicao de `CRI_2028.CR3` e 1,03 na referencia aprovada contra 0,35 previsto, uma distancia de 0,68 EV. O contraste de `CRI_2043.CR3` e 36,0 contra 19,1 previsto, uma distancia de 16,9. Esses cinco exemplos nao substituem as metricas das 92 fotos em `07_raws_e_piloto.md` nem constituem avaliacao visual de imagens renderizadas.

## Comparacao funcional e proposta local

As sete opcoes abaixo foram observadas nos screenshots. Sua funcao foi conferida na documentacao publica oficial. Os nomes da nossa coluna sao propostas de produto. O comparador antigo tem QA nativo; o novo pacote implementa analise da selecao, resultados e diagnostico, com QA local e teste nativo ainda pendente.

| Opcao observada | Modulo proposto | Funcao local e estado atual |
| --- | --- | --- |
| Start Culling (Beta) | Selecionar fotos | Agrupar sequencias, facilitar comparacao e registrar estrelas/bandeiras. Planejado; nunca inferir rejeicao pela simples ausencia de uma foto no treino. |
| Create SmartPreset | Criar e gerenciar estilos | Escolher referencias aprovadas, treinar e avaliar revisoes do estilo. Existe um modelo numerico experimental por scripts; interface, varios estilos e treino na maquina de edicao pendentes. |
| Edit Photos | Editar fotos selecionadas | Analise nova da selecao e revisao numerica implementadas no pacote local, com um estilo experimental. Selecao de estilos, previa visual e escrita reversivel pendentes. |
| Download Edits | Processamentos e resultados | Progresso, cancelamento entre fotos, erros por arquivo, JSON/CSV e consulta do ultimo resultado implementados. Retomada automatica e historico pela interface pendentes. |
| Set Up Flows | Fluxos locais | Importacao e processamento a partir de pastas/cartoes, com revisao e tratamento de duplicatas. Planejado; integracao com camera/cartao exige teste real. |
| Send Corrections | Aprender com correcoes | Capturar ajustes finais explicitamente aprovados e produzir nova revisao avaliada do modelo. Planejado; a aprovacao inicial do acervo ja foi registrada separadamente. |
| Adjust SmartPreset | Ajustar estilo | Alterar preferencias e intensidade de um estilo, com previa e receita persistida, sem exigir novo treino para cada ajuste global. Planejado. |

No Neurapix, enviar correcoes fornece novos exemplos finais para melhorar o estilo; ajustar SmartPreset altera preferencias sem retreinar. Nosso fluxo deve manter essa distincao. Como o processamento solicitado e local, resultados ficam disponiveis pela fila na propria maquina de edicao. A comparacao de menus nao demonstra que nossos algoritmos tenham a arquitetura ou precisao do produto de referencia.

O guia de edicao do Neurapix tambem documenta mascaras, recorte e endireitamento dentro de Edit Photos. Esses recursos ficam em etapas posteriores: mapear primeiro suporte da API e versao do Lightroom, dados necessarios e processamento local disponivel. Uma ferramenta existente na interface do Lightroom nao implica automaticamente uma API de plugin para ela. Preservar curvas/perfis ja extraidos e mapear os controles adicionais antes de prometer aprendizado completo do estilo. P&B deve ter avaliacao propria.

## Marcos com criterios verificaveis

1. **Precisao e cobertura:** adquirir pares de outros trabalhos autorizados com o mesmo cuidado de identidade/hashes; reservar eventos completos para avaliacao independente. Comparar cada controle com uma referencia simples, registrar cameras/iluminacao e obter avaliacao visual em renderizacoes do Lightroom. Evitar ajustar repetidamente contra as mesmas 92 fotos de teste.
2. **Motor local e analise de fotos novas:** instalar runtime e dependencias na maquina de edicao, registrar versao do modelo/dominio de entrada e executar a partir da selecao do catalogo. Provar uma foto fora das 92 referencias salvas, com resultado realmente calculado naquela execucao. O ambiente virtual de desenvolvimento e os caminhos privados atuais nao sao um instalador portatil.
3. **Previa e aplicacao reversivel:** apresentar foto, ajustes, estilo e progresso. Aplicar inicialmente em copias virtuais identificadas; conferir suporte real do SDK. Registrar estado anterior e resultado; testar cancelamento, falha parcial e restauracao no Lightroom antes de ampliar o lote. Apresentar avisos de camera/dominio nao suportados com base em limites observaveis, sem inventar probabilidades de confianca.
4. **Estilos e aprendizado continuo:** registro de referencias aprovadas, separacao treino/avaliacao e revisoes de modelo. Manter separado o ajuste global de preferencias do reprocessamento dos exemplos para treino. Validar uma revisao antes de torna-la ativa e permitir recuperar a anterior.
5. **Selecao e fluxos:** implementar e avaliar agrupamento/triagem e importacao automatizada depois do nucleo de edicao. Marcar escolhas por estrelas/bandeiras, preservando RAWs e edicoes recebidas. Testar cada origem fisica no ambiente real.

Cada comando deve entrar no menu junto de sua operacao funcional e persistencia, com QA nativo como etapa de validacao. O mapeamento inicial foi uma revisao de documentacao. A implementacao posterior em `10_motor_local_e_atualizacao.md` produz um novo pacote funcional; a instalacao antiga permanece preservada ate a atualizacao pelo usuario.

## Fontes verificadas em 2026-10-29

- [Selecao de imagens](https://neurapix.com/help/image-selection).
- [Criacao de SmartPreset](https://neurapix.com/help/create-classic-smartpreset).
- [Edicao local](https://neurapix.com/help/edit-photos-locally).
- [Edicao no servidor e recebimento dos resultados](https://neurapix.com/help/edit-photos-on-server).
- [Flow Card](https://neurapix.com/help/flow-card).
- [Enviar correcoes](https://neurapix.com/help/send-corrections).
- [Ajustar SmartPreset](https://neurapix.com/help/adjust-smartpreset).
- [Mascaras, recorte e endireitamento](https://neurapix.com/help/extra-features).

Essas fontes sustentam o comportamento documentado do produto de referencia. Disponibilidade e implementacao dos nossos modulos dependem dos marcos acima; nao foram inferidas dos nomes de menu.
