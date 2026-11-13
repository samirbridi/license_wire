# Falha HasCrop, continuidade do lote e atualizacao dentro do Lightroom

Data: 2026-11-13 (America/Sao_Paulo). Pedido: corrigir o atualizador bloqueado pelo Windows, oferecer atualizacao dentro do Lightroom e impedir que uma falha de enquadramento pare lotes de 15/100+ fotos.

## Evidencia e causas

- Imagem `WhatsApp Image 2026-11-13 at 20.09.30 (1).jpeg`: `PSSecurityException/UnauthorizedAccess` antes de carregar Update-CrispixPlugin.ps1. O CMD distribuido chamava PowerShell sem `-ExecutionPolicy Bypass`.
- Imagens 20.09.30 e 20.09.44: `PhotoEditor.lua`, `Ajuste nao confirmado: HasCrop`. `M.horizon()` acrescentava `HasCrop=true`; `verifyApplied()` exigia igualdade desse booleano na leitura do host. HasCrop e um campo XMP (documentacao Adobe: https://developer.adobe.com/xmp/docs/xmp-namespaces/crs/); a referencia SDK preservada em `evidence/sdk-photo-reference.html` lista os cinco controles numericos Crop*, sem prometer esse booleano. Nao temos o JSON de readback da maquina de Cris para distinguir ausente/false; os testes reproduzem a ausencia. A geometria continua verificada.
- Tanto `applyInPlace()` quanto `applyPlan()` propagavam falhas de aplicacao/conferencia como erro da sessao. O tratamento de falhas por foto existente no motor de inferencia nao cobria a etapa de escrita no Lightroom.
- `CheckUpdates.lua` usava o `pcall` de Lua 5.1 em torno de `LrHttp.get`, que pode ceder execucao. O teste com coroutine reproduz a incompatibilidade; usar `LrTasks.pcall`. Os testes antigos respondiam HTTP imediatamente e nao exercitavam essa condicao.
- O atualizador recebia implicitamente Documents/CRISPIX.lrplugin, mesmo quando o plugin em uso estava em outra pasta. O comando de menu apenas revelava o CMD no Explorer.
- Imagem 20.11.33 (`0 de 8`, sem linhas confiaveis) corresponde a recusa do detector, distinta da excecao de escrita. As medicoes existentes em `evidence/horizon-ground-truth-0037.json` mostram cobertura de aproximadamente 2%; os limiares nao foram afrouxados nem se afirma enquadramento automatico perfeito.

## Mudancas

- Nao grava nem exige readback de HasCrop. Confere CropAngle e quatro coordenadas; tolerancia das coordenadas reduzida de 0.01 para 0.0001. Ate seis leituras em um segundo para acomodar readback atrasado, sem reaplicar ajustes.
- Falhas de escrita/conferencia ficam em `NNN-failed.json` e o lote segue. `outcome.json` tem contagens reais, IDs confirmados e erros. O resumo nao conta propostas como horizontes aplicados. Fotos que falharam podem ter ajustes parciais; registros before/snapshots e protecao contra sobrescrever mudancas manuais permanecem.
- Cancelamento, troca de catalogo, identidade/selecao inesperada, origem alterada e falha de journal continuam protegidos; nao se ignora uma falha estrutural para forcar o lote.
- Pasta vigiada marca somente sucessos como editados e nao repete automaticamente as fotos com aplicacao nao confirmada.
- Comando VERIFICAR ATUALIZACOES no menu principal e botao no Gerenciador de plug-ins. O dialogo oferece Atualizar agora e informa fechamento/reabertura e backup do catalogo.
- `Launch-CrispixUpdate.py` usa o Python embarcado para iniciar um PowerShell separado e oculto, com caminhos como dados em comando UTF-16LE/base64. Copia o script para pasta temporaria antes de substituir o plugin, registra transcript e mostra resultado. Nao depende de Python instalado.
- CMD usa Bypass apenas naquele processo e passa sua propria pasta. Instalador valida manifesto/pacote/versao, impede concorrencia, mantem backup unico e restaura se a instalacao falhar. Limpeza temporaria exige caminho dentro de TEMP com prefixo e GUID esperados. Nenhum Set-ExecutionPolicy permanente; nenhuma mudanca no aprendizado/AppData.

## Validacao reproduzivel

```powershell
python -m unittest discover -s scripts -p test_batch_recovery_lua.py -v
python -m unittest discover -s scripts -p test_check_updates_lua.py -v
python -m unittest discover -s scripts -p test_updater.py -v
python -m unittest discover -s scripts -p 'test_*.py' -v
node scripts/version-from-commits.mjs --write
python scripts/build_lightroom_local.py --runtime-base private/runtime/culling-base-c75c76d3 --model-folder private/raw-datasets/20261029T172842Z-c6cf2182/pilot-models/20261111T214051736452Z --dataset private/raw-datasets/20261029T172842Z-c6cf2182 --manifest private/snapshots/20261029-124518-192a6383/analysis/extraction-20261029T155812079523Z/candidate-settings.jsonl
```

Regressoes: lotes de 105 fotos, erro na primeira/no meio, em edicao direta e novas copias; 104 sucessos + 1 falha, ultima foto aplicada e 105 restauradas. Mais: 15 fotos com readback atrasado/HasCrop ausente, cancelamento apos falha, contagens reais no fluxo completo, pasta vigiada sem retry de falhas. Instalador testado com plugins descartaveis e mocks explicitos de rede/processos: sucesso via rede e internet com BOM, hash incorreto, versao incorreta e rollback apos falha de movimentacao. Sem tocar no Lightroom ou em instalacoes reais.

## Limites e proximo passo

Suite completa: **202 testes aprovados em 243.303 s**, registro `evidence/qa-batch-updater.txt`. Revalidacoes focadas apos endurecer manifesto/limpeza: 11 testes do checker e 3 testes do instalador aprovados (o teste de integracao cobre cinco cenarios, incluindo internet com BOM).

Versao calculada pelo script: **v0.25.0 (build 0039)**, derivada dos commits `e0bce06433a24038869fdf5cef1e46e77a23a5b3` (fix) e `a8e87973577f309a8bd1ffb17ee859dfeb202311` (feat). Recibo `evidence/release-build-0039.json`; changelog gerado com rastreabilidade.

Pacote: `private/deliveries/CRISPIX-0.25.0-build0039-2731bcbb/CRISPIX-0.25.0-build0039-motor-local.zip`, 84.048.199 bytes, SHA-256 `43584a46a6f754016f0c6cab2bd645350fdcb45df7ee4b48f622936e7b1ae8c1`. Comando final: `python scripts/verify_editing_release.py --package private/deliveries/CRISPIX-0.25.0-build0039-2731bcbb/package.json --unit-tests-passed 202`. Aprovado: CRC, 1.748 hashes, 34 fontes Lua compiladas, runtime isolado, dois RAWs reais, escrita/restauracao no duplo SDK e hashes dos originais preservados. Recibo `evidence/editing-plugin-qa-0039.json`. Modelo numerico permanece o mesmo.

Nao havia Lightroom aberto no computador de desenvolvimento. Testes de SDK usam doubles Lua 5.1; nao substituem QA nativo: conferir nova interface, atualizar uma instalacao de teste, endireitar foto de angulo conhecido e restaurar. O detector pode manter o corte em fotos sem linhas confiaveis. Esta sessao prepara um pacote local; publicacao nos canais online/rede nao faz parte desta validacao.
