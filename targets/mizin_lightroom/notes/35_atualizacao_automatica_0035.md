# v0.22.0 build 0035 — atualizacao automatica (sem reinstalar manualmente)

Pedido do usuario: confirmar que o aprendizado persiste entre atualizacoes do plugin (ja respondido na nota 33/34: fica em %AppData%, fora da pasta .lrplugin); e pedido direto de automatizar a atualizacao, sem precisar remover/adicionar manualmente no Gerenciador de plug-ins a cada versao nova — seja reconhecimento automatico pelo proprio plugin, seja publicacao automatizada.

## Decisao de desenho

Perguntado ao usuario onde o plugin deveria procurar por versoes novas; escolhido reaproveitar o compartilhamento de rede `\\192.168.1.58\Users\Public\Documents\MizinLightroomPilot`, ja usado em entregas anteriores (confirmado acessivel com leitura E escrita nesta sessao).

Avaliado o risco de self-update verdadeiro (o proprio Lua em execucao sobrescrevendo seus arquivos enquanto o Lightroom os tem carregados em memoria, no Windows): evitado deliberadamente. Em vez disso, dividido em duas pontas que juntas dao a experiencia pedida sem esse risco:
1. **Deteccao dentro do plugin** (CheckUpdates.lua): compara versao local com o canal e PEDE para atualizar — exatamente a frase do usuario ("o plugin reconhecer e pedir para se atualizar").
2. **Atualizacao de fato** (Update-CrispixPlugin.ps1 + Atualizar-CRISPIX.cmd, 1 clique): roda FORA do processo do Lightroom (PowerShell independente), entao pode fechar o Lightroom com seguranca, trocar os arquivos sem ninguem os tendo abertos, e reabrir — sem jamais pedir para o usuario ir ao Gerenciador de plug-ins remover/adicionar nada.

## Implementado

**`CheckUpdates.lua`** (novo, FERRAMENTAS E APRENDIZADO > "Verificar atualizações"): le `BuildInfo.json` local (`io.open`, sem modulo SDK) e `latest.json` no canal de rede. Numero do build extraido do texto da versao (`build (%d+)`) para comparacao numerica confiavel. Tres desfechos: canal inacessivel (avisa sem travar), ja atualizado (confirma), versao nova disponivel (`LrDialogs.confirm` com os numeros das duas versoes e a garantia explicita de que dados sao preservados; ao aceitar, usa `LrShell.revealInShell` para abrir a pasta do atualizador — nunca executa nada sozinho sem o usuario ver).

**`Update-CrispixPlugin.ps1`** (novo, copiado para dentro do proprio pacote): valida SHA-256 do ZIP do canal ANTES de tocar em qualquer coisa; fecha o Lightroom Classic de forma limpa (`CloseMainWindow`, espera 15s, so forca com confirmacao explicita se nao fechar sozinho); faz backup (`.bak`) da instalacao anterior; extrai e MOVE a nova versao para a MESMA pasta fixa de instalacao (nunca cria pasta nova, nunca exige re-cadastro no Gerenciador); remove o backup so apos sucesso confirmado; restaura o backup automaticamente se qualquer etapa falhar; oferece reabrir o Lightroom ao final. Suporta `-NonInteractive` para automacao futura (ex.: agendador de tarefas), mas o uso padrao pede confirmacao antes de fechar o Lightroom e antes de forcar o encerramento.

**`Atualizar-CRISPIX.cmd`** (novo): atalho de duplo-clique de 2 linhas que chama o `.ps1` acima sem flags de bypass de politica de execucao (decisao deliberada: `-ExecutionPolicy Bypass` foi recusado pelo classificador de seguranca da sessao por contornar controle de endpoint sem autorizacao explicita nomeando o bypass; o script roda com a politica ja configurada na maquina, que e o padrao seguro recomendado).

**`Publish-CrispixBuild.ps1`** (novo, lado do desenvolvimento): le `private/deliveries/latest.json` (agora gravado automaticamente por `build_lightroom_local.py` a cada build), copia o pacote + `LEIA-ME.md` + `SHA256SUMS.txt` + `package.json` para uma subpasta no canal, copia o ZIP tambem na raiz do canal como fallback, valida o hash no DESTINO (nao so na origem) antes de considerar publicado, e so entao atualiza o `latest.json` do canal — publicacao e tratada como um ato atomico no final.

**Executado de ponta a ponta nesta sessao** (nao so simulado): `Publish-CrispixBuild.ps1` publicou o build 0035 de fato no compartilhamento real; hash validado no destino; `latest.json` real confirmado no canal com os campos esperados. A logica de comparacao de versao (string com zero a esquerda `"0035"` -> inteiro `35`, tanto em PowerShell quanto em Lua) foi confirmada correta em testes isolados contra esse manifesto real, sem tocar em nenhum processo do Lightroom (confirmado que nao havia nenhum rodando nesta maquina) nem em instalacao real.

## Verificacao

- 182 testes OK (5 novos em `test_check_updates_lua.py`): canal inacessivel avisa sem travar; ja atualizado so informa; versao nova oferece revelar o atualizador e menciona a preservacao dos dados; recusar a oferta nao abre nada; primeira instalacao (sem BuildInfo.json local) ainda funciona.
- Pacote `private/deliveries/CRISPIX-0.22.0-build0035-e124363d/`, ZIP `CRISPIX-0.22.0-build0035-motor-local.zip` 84.037.490 bytes, SHA-256 `d2a63871609f7e307bb14621887846daa5a70eefcf0827f284e7041ee7e49fea`, 1.746 arquivos, 33 fontes Lua (+1: CheckUpdates.lua; +2 arquivos nao-Lua: Atualizar-CRISPIX.cmd, Update-CrispixPlugin.ps1).
- `verify_editing_release.py --unit-tests-passed 182` OK: 1.746 hashes conferidos (cobre os novos .cmd/.ps1 genericamente via SHA256SUMS.txt, sem precisar de ajuste no verificador), CRC OK, 33 fontes Lua identicas ao `reconstructed/`, `numericPilotUnchanged` true (nenhum retreino nesta entrega).
- Publicado de verdade: `private/deliveries/latest.json` e o canal `\\192.168.1.58\Users\Public\Documents\MizinLightroomPilot\latest.json` confirmados identicos e corretos.

## Pendente / limites

- O fluxo completo de `Update-CrispixPlugin.ps1` (fechar Lightroom real, extrair sobre instalacao real, reabrir) nao foi exercitado de ponta a ponta nesta sessao — rodar isso exigiria fechar/reabrir o Lightroom real da maquina de edicao ou forcar encerramento de processo sem autorizacao explicita para esse teste especifico, o que nao foi pedido. Testado isoladamente: validacao de hash, logica de comparacao de versao (PowerShell e Lua), e publicacao real no canal.
- `Atualizar-CRISPIX.cmd`/`Update-CrispixPlugin.ps1` assumem Lightroom.exe no caminho padrao (`C:\Program Files\Adobe\Adobe Lightroom Classic\Lightroom.exe`) para reabrir; se a instalacao do usuario for outro caminho, o script avisa e pede abertura manual em vez de falhar silenciosamente.
- `InstallDirectory` padrao do atualizador (`Documents\CRISPIX.lrplugin`) e uma convencao nova para favorecer updates no mesmo lugar; se a instalacao atual do usuario estiver em outra pasta, o parametro `-InstallDirectory` deve apontar para ela na primeira execucao.
- Nada copiado para Downloads; sem commits; VERSION manual.
