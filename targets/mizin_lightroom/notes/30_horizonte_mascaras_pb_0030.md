# v0.18.0 build 0030 — horizonte, mascaras adaptativas e P&B

Pedido do usuario: implementar corte/horizonte, mascaras pessoa/ceu, Smart Previews, edicao na importacao e P&B "usando os arquivos do Neurapix". Recusado copiar codigo/recursos/pesos do fornecedor (direitos autorais/licenca; o motor dele e nativo compilado com pesos opacos). Implementacao independente; as notas do alvo neurapix serviram apenas como mapa de fronteiras (ex.: uso de presets/applyDevelopPreset, campos CropAngle/MaskGroupBasedCorrections).

## Implementado

**Horizonte** (`scripts/horizon_analysis.py` agora no pacote; `local_engine.horizon_for`; `PhotoEditor.M.horizon`).
- Motor roda o detector no JPEG tecnico orientado quando `request.geometry.horizon`; devolve dimensoes. Falha nunca bloqueia a foto. Leitura via `np.fromfile+imdecode` (caminhos nao-ASCII).
- Lua aplica so em NOVAS COPIAS (restauracao exata por snapshot), so com crop padrao (nunca substitui corte do fotografo), angulo 0,25-8 graus. Corte centralizado com a mesma proporcao: `s=min(W/(Wcos+Hsin), H/(Wsin+Hcos))`, margem `(1-s)/2` arredondada para cima; `HasCrop=true`. Simetrico em W/H, portanto independe da convencao de orientacao.
- `HORIZON_SIGN=1` em um unico lugar. PENDENTE: confirmar o sinal de CropAngle no Lightroom com foto inclinada conhecida; se a inclinacao dobrar, trocar para -1. Tambem confirmar que LR interpreta Crop* como retangulo antes da rotacao em torno do centro.

**Mascaras pessoa/ceu** via preset ADAPTATIVO do proprio Lightroom (IA da Adobe). Opcao na janela; so em novas copias. Antes de qualquer escrita, o preset precisa ter `MaskGroupBasedCorrections` nao vazio. `copy:applyDevelopPreset(preset,_PLUGIN.id)` no mesmo write gate apos os ajustes; verificacao estrita dos nossos controles continua (preset que altere exposicao etc. gera falha/recuperacao); chaves de mascara saem da checagem de preservacao somente nesse caso. `NNN-applied.json` registra `masksChanged`. PENDENTE nativo: se o caminho SDK dispara o calculo das mascaras adaptativas.

**P&B** como variante separada.
- `develop_targets.MONOCHROME_BOUNDS` (GrayMixer x8), `bounds_for(variant)`. Referencia em cor com GrayMixer e recusada.
- Coleta manual e aprendizado do catalogo aceitam P&B (`styleVariant='monochrome'`, assinatura propria com mixer).
- `learning_store`: treino, resumo e `latest_candidate` por variante; avaliacoes P&B com chave `monochrome:<evento>` e eventos usados contados por variante — P&B nunca consome/bloqueia o historico de cor. Avaliacoes antigas sem `styleVariant` = cor.
- `learning-update` treina cor e P&B. Analise: fotos P&B usam o ultimo candidato P&B; sem ele, somente essas fotos falham com mensagem (dialogo de lote parcial do 0029 cobre o resto). Edicao nunca altera `ConvertToGrayscale` (checagem de preservacao).
- Modelo P&B so nasce com 3 trabalhos x 50 referencias P&B. O snapshot de treino tinha 88 P&B no total; provavelmente insuficiente.

**Correcao no preset complementar (0029)**: em edicao direta, chaves que a foto nao possui sao omitidas para a restauracao pelo registro `before` ser exata. `HasCrop` bloqueado no preset.

## Nao implementado (decisao tecnica)

- **Smart Previews**: o modelo foi treinado no dominio LibRaw do RAW completo; trocar a entrada por DNG reduzido/compactado muda as features. O SDK nao expoe caminho oficial do DNG Smart Preview (nota 26). Exige coletar pares RAW/Smart Preview e treinar/validar um dominio novo antes de ativar. Nao substituir silenciosamente.
- **Edicao automatica na importacao**: o SDK nao tem evento de importacao; exigiria polling e escrita sem revisao. Proposta futura segura: "pasta vigiada" opt-in, somente novas copias, fila retomavel com pausa, registro e limite por lote.

## Verificacao

- 153 testes OK (+8): contrato P&B do motor, horizonte em imagem sintetica com caminho acentuado e falha tolerada, treino P&B separado e nao interferindo na cor, GrayMixer recusado em cor, coleta P&B com mixer, corte seguro do horizonte e preservacao de corte, horizonte so em copias, preset adaptativo aplicado/restaurado e preset sem mascaras recusado sem escrita, preset em edicao direta.
- Pacote `private/deliveries/CRISPIX-0.18.0-build0030-cb1538d8/`, ZIP 84.018.396 bytes, SHA-256 `91f90d749fad984444a31cd862ad0401ef978724c43021052f9f1c713c6232b1`, 1.739 arquivos. `verify_editing_release.py` OK com dois RAWs reais. Motor do pacote com horizonte+P&B: retrato 684x1024 mantido (sem linhas confiaveis), P&B sem modelo falhou isoladamente. Recibos `evidence/package-0030.json`, `evidence/editing-plugin-qa-0030.json`, `evidence/geometry-monochrome-qa-0030.json`.
- Nada executado no Lightroom real; nenhuma proposta de horizonte em RAW real ainda (as duas fotos de QA sao retratos). Nada copiado para Downloads/compartilhamento; sem commits; VERSION manual.
