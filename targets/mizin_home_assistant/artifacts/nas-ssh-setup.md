# Acesso SSH permanente ao NAS (Claude Code) — regras e estado real

## Escopo de volume (regra do proprietário, 1/11/2026 — a mais importante desta página)

O usuário `VSCode` tem acesso de administrador total ao NAS, mas o uso real é restrito por decisão
explícita do proprietário: **só os volumes `docker` e `HDD 1TB - V2` podem ser lidos ou escritos**
(é onde moram o Docker, o futuro Home Assistant, e as gravações das câmeras — `Mizin-Home` e
`Mizin-Cameras`, ambos dentro de `HDD 1TB - V2`). Os demais volumes do NAS (`HDD 1.5TB`, `HDD 12TB`,
`HDD 1TB - V1`) **nunca são tocados** — nem leitura, nem escrita — mesmo que o acesso técnico permita.
Antes de qualquer comando remoto que não seja óbvio por si só, confirmar mentalmente que o caminho
começa em `/volume4` (onde `HDD 1TB - V2` está montado, confirmado via `bridge.yaml`/`compose
-volume4-*.yaml`) ou em `/volume1`/local do próprio `docker`, nunca nos outros volumes.

## Regra de confirmação (1/11/2026, reafirmada depois do acesso funcionar)

Ter acesso SSH não muda o padrão de trabalho já seguido nesta sessão: qualquer mudança em arquivo de
configuração ativo (ex: `bridge.yaml`, compose em produção) ou ação que afete o sistema rodando
continua sendo confirmada com o proprietário antes de executar, mesmo com acesso técnico de sobra para
fazer sozinho. Leitura (conferir configs, ler logs, checar status) dentro do escopo de volume acima não
precisa de confirmação a cada vez. O acesso é para reduzir o passo manual de copiar/colar comandos, não
para agir sem avisar. Isso vale com mais força ainda por causa do acesso de administrador total.

## Estado real da configuração (1/11/2026)

O plano original (chave SSH + usuário restrito aos compartilhamentos Mizin-*) não coube na interface do
DSM desta instalação: não havia campo de chave pública na tela de usuário, e o SSH recusava conexão até
o usuário entrar no grupo `administrators` — aparentemente a única forma de liberar acesso a Terminal
nesta versão do DSM, sem um caminho de permissão mais granular visível na UI. O escopo de volume acima
é o controle real, já que o controle de acesso do DSM não ofereceu um caminho mais granular.

O que está em uso de fato:
- Usuário `VSCode`, membro do grupo `administrators`.
- Autenticação por **senha**, não por chave pública. A senha fica em
  `targets/tuya_smartlife/runtime/nas-ssh-password.txt` (texto puro, gitignored) — decisão explícita
  do proprietário de manter salva ali para reuso, em vez de pedir a cada sessão. Decisão reafirmada
  depois de um incidente de exposição (ver abaixo) com a mesma senha ainda em uso.
- A chave ed25519 gerada antes (`nas-ssh-key`/`nas-ssh-key.pub`) **não está em uso** — ficou sem
  utilidade porque não havia onde colá-la no DSM. Mantida no disco (gitignored) por ora, sem
  propósito ativo.
- SSH confirmado funcionando (1/11/2026). Aviso de "Could not chdir to home directory" no login é
  esperado (o usuário não tem pasta pessoal própria no NAS) e inofensivo — a sessão cai em `/`.
- `sudo` sem senha confirmado ativo (1/11/2026): `/etc/sudoers.d/vscode-nopasswd` instalado e validado
  (`sudo -n whoami` devolve `root` sem pedir senha). Leitura via sudo testada no `bridge.yaml` real
  dentro de `HDD 1TB - V2` (só confirmação de legibilidade, conteúdo nunca impresso).
- SFTP **não está disponível** neste DSM (`scp.exe` e `paramiko.open_sftp()` falham com "Channel
  closed"/"subsystem request failed"): subir arquivo usa `cat > arquivo` via `exec_command` com stdin
  binário bruto, não SFTP.

## Incidente registrado: exposição parcial da senha (1/11/2026)

Uma tentativa inicial de configurar `sudo` sem senha pediu um pseudo-terminal (PTY) para um comando
`sudo -S` e escreveu a senha nesse canal — um PTY ecoa de volta tudo que é escrito nele, então a senha
apareceu em texto visível no output de uma ferramenta. O proprietário foi avisado na hora e optou
explicitamente por manter a mesma senha em vez de trocá-la. Corrigido no script de automação
(`nas-ssh-run.py`): comandos via `--sudo` agora usam `get_pty=False`, que não ecoa a entrada, mais uma
rede de segurança que nunca deixa a senha aparecer no output mesmo que ela apareça ali por algum outro
motivo no futuro.

## Como conectar (deste PC)

Script dedicado, não comando solto — evita reconstruir a lógica de senha/PTY a cada vez:

```bash
python "targets/tuya_smartlife/runtime/nas-ssh-run.py" "<comando remoto>"
python "targets/tuya_smartlife/runtime/nas-ssh-run.py" --sudo "<comando que precisa de root>"
```

Usa `paramiko` (biblioteca Python pura, `pip install paramiko`) em vez de `ssh.exe`/`PowerShell`
`SSH_ASKPASS`: o caminho nativo do Windows exigia um arquivo `.cmd` temporário e sofria de problemas de
escape de aspas aninhadas em comandos mais complexos — `paramiko` lida com a senha como string Python
direta, sem nenhuma camada de shell no meio.

**Limitação conhecida, não resolvida**: a conexão trava intermitentemente — às vezes na chamada
`client.connect()` em si, outras vezes aparentemente dentro de `client.close()` — em cerca de 1 a cada
3 tentativas nesta sessão. Quando conecta, é rápido (~1-2s) e o resultado sempre veio correto; quando
trava, trava de verdade (não é só lento) e precisa ser encerrado por um `timeout` externo. Causa não
identificada: testado e descartado import do paramiko, criação do client, e o próprio `os._exit()` no
final do script como causas — o travamento acontece antes de qualquer print aparecer quando ocorre, o
que aponta para algo na camada de rede/socket entre este PC e o `sshd` do DSM, não um bug do script.
Sempre rodar comandos deste script com um timeout externo (`timeout Ns ...` no Git Bash, ou equivalente)
e estar pronto para tentar de novo se travar — nunca assumir que uma tentativa sem resposta significa
que o comando remoto falhou, pode só não ter conseguido nem conectar.

## Nunca fazer com este acesso

- Ler ou escrever fora de `docker`/`HDD 1TB - V2` (ver escopo de volume no topo desta página).
- Imprimir a senha (ou qualquer parte dela — tamanho, primeiro/último caractere) em output de
  ferramenta, log ou nesta documentação.
- Usar este SSH como substituto da sessão DSM autenticada do proprietário no navegador (são mecanismos
  diferentes, nunca misturar).
- Aplicar mudança em configuração de produção sem confirmar antes, mesmo que o acesso técnico permita
  fazer sozinho sem pedir.
