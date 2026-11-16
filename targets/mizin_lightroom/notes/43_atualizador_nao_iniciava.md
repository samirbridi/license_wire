# Atualizar agora nao fazia nada dentro do Lightroom

2026-11-16, America/Sao_Paulo. Relato do usuario: em VERIFICAR ATUALIZACOES (Gerenciador de plug-ins ou menu da Biblioteca), o CRISPIX mostrava a versao nova e avisava que ia fechar e reabrir o Lightroom. Depois de Atualizar agora, nada acontecia. Complementa a nota 39, onde o atualizador interno foi criado sem validacao nativa.

## Cadeia

`CheckUpdates.lua` -> `LrTasks.execute` (cmd) -> `Runtime/pythonw.exe -I Launch-CrispixUpdate.py` -> PowerShell oculto com `-EncodedCommand` -> `Update-CrispixPlugin.ps1 -NonInteractive -Reopen`.

## Causa (reproduzida nesta maquina, sem Lightroom)

- Copia de teste do plugin 0040 no scratchpad, disparada com a mesma linha de comando do Lua via `cmd /c`.
  - cmd retornou 0 em ~1 s, entao o Lua nao mostra erro.
  - A pasta `%TEMP%\crispix-updater-*` recebeu so o script copiado; **nenhum update.log** e o plugin continuou no 0040.
- `Launch-CrispixUpdate.py` iniciava o PowerShell com `DETACHED_PROCESS`, sem console. O `powershell.exe` 5.1 sai com codigo 0 **sem executar nenhuma linha** do comando codificado. Como a saida ia para DEVNULL, a falha era silenciosa.
- Com `CREATE_NO_WINDOW` (console oculto), o mesmo comando rodou inteiro:
  - manifesto pela internet, download do R2, SHA-256, extracao;
  - backup `.bak-*` e troca da pasta 0040 -> 0042.
- Em teste lado a lado com um comando minimo, `DETACHED_PROCESS` "terminou sem iniciar (codigo 0)" e `CREATE_NO_WINDOW` executou.
- Nao foi possivel ler o update.log da maquina de edicao: o compartilhamento `\\192.168.1.58\Users` so expoe Public. A reproducao local cobre a mesma cadeia e os mesmos arquivos (os scripts do updater do 0040 sao identicos aos do 0042).

## Correcao (build 0043)

- `Launch-CrispixUpdate.py`:
  - Nova funcao `start()` com `CREATE_NO_WINDOW | CREATE_NEW_PROCESS_GROUP`.
  - Pede tambem `CREATE_BREAKAWAY_FROM_JOB`, para fechar o Lightroom nao encerrar o instalador; se o job do Windows recusar, tenta de novo sem.
  - Espera ate 25 s pelo update.log. Se o PowerShell terminar sem comecar, sai com codigo != 0; o Lua entao mostra o aviso "Nao foi possivel iniciar o atualizador... Execute Atualizar-CRISPIX.cmd".
- `Update-CrispixPlugin.ps1`: reabre o mesmo `Lightroom.exe` que estava aberto (caminho do processo), com o caminho padrao como reserva.
- `CheckUpdates.lua`: depois de iniciar, mostra um aviso nao modal (`showBezel`). Um dialogo modal impediria o Lightroom de fechar.
- Testes novos:
  - `test_updater.py`: flags, reserva sem breakaway e falha ruidosa sao simulados; um quinto teste roda o PowerShell real e exige que o comando execute de fato. Esse teste falha com a flag antiga.
  - `test_check_updates_lua.py`: aviso nao modal e nenhuma mensagem modal.
  - Suite: 224 ok.
- Ponta a ponta com o launcher novo via `cmd /c`: copia 0040 -> 0042 instalada, backup preservado.

## Importante para quem ja tem o plugin instalado

O launcher quebrado esta **dentro** do plugin instalado (0040/0042). Nenhuma publicacao conserta a primeira atualizacao. E preciso rodar uma vez o `Atualizar-CRISPIX.cmd` da pasta do plugin; ele chama o `Update-CrispixPlugin.ps1` direto, com console visivel, e nao depende do launcher. Do 0043 em diante, o botao do Lightroom funciona.

## Pendente

- Validacao nativa no Lightroom da maquina de edicao. Ainda nao foi confirmado se o Lightroom poe processos filhos num job e se recusa o breakaway; o codigo cobre os dois casos.
