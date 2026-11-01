# Acesso SSH permanente ao NAS (Claude Code) — regras e procedimento

## Regra combinada (1/11/2026)

Ter acesso SSH não muda o padrão de trabalho já seguido nesta sessão: qualquer mudança em arquivo de
configuração ativo (ex: `bridge.yaml`, compose em produção) ou ação que afete o sistema rodando
continua sendo confirmada com o proprietário antes de executar, mesmo com acesso técnico de sobra para
fazer sozinho. Leitura (conferir configs, ler logs, checar status) não precisa de confirmação a cada
vez. O acesso é para reduzir o passo manual de copiar/colar comandos, não para agir sem avisar.

## Chave gerada (1/11/2026)

- Arquivo: `targets/tuya_smartlife/runtime/nas-ssh-key` (privada) / `nas-ssh-key.pub` (pública) —
  ambos gitignored, nunca saem desta máquina/repositório.
- ed25519, dedicada só a este uso (não reaproveita nenhuma chave existente do proprietário).
- Chave pública para colar no DSM:
  ```
  ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMuqdc+UfDFzGRd0OCiLy51BncSJe1qqmgf+vI8ukJla claude-code-nas-automacao
  ```

## Passo a passo no DSM (proprietário)

1. **Painel de Controle → Terminal e SNMP → Terminal**: marcar "Habilitar serviço SSH". Porta padrão
   22, pode manter.
2. **Painel de Controle → Usuário e Grupo**: usar um usuário existente ou criar um dedicado (ex:
   `claude-automacao`) com os grupos/permissões mínimos necessários — acesso aos compartilhamentos
   `Mizin-Home` e `Mizin-Cameras` (já usados via SMB nesta sessão) e permissão de usar o Terminal via
   SSH. Evitar usar a conta de administrador principal para isto.
3. Colar a chave pública acima no método de login SSH desse usuário (DSM permite login por chave
   pública nas propriedades avançadas do usuário, ou via `~/.ssh/authorized_keys` depois do primeiro
   login por senha — o caminho exato varia por versão do DSM; se a opção não aparecer na interface,
   me avisa que eu oriento o comando certo depois de confirmar a versão).
4. **Painel de Controle → Segurança → Firewall**: se o firewall já estiver configurado (fizemos isso
   para a porta RTSP, ver `bridge-firewall-dsm.md`), adicionar uma regra permitindo a porta 22 (SSH)
   só para o IP deste PC — mesmo padrão de "abrir porta só para este PC" já usado.
5. Testar a conexão (deste PC, depois dos passos acima):
   ```bash
   ssh -i "targets/tuya_smartlife/runtime/nas-ssh-key" <usuario>@192.168.1.186
   ```

## Nunca fazer com este acesso

- Extrair ou copiar a chave privada para fora desta máquina.
- Usar este SSH como substituto da sessão DSM autenticada do proprietário no navegador (são mecanismos
  diferentes, nunca misturar).
- Aplicar mudança em configuração de produção sem confirmar antes, mesmo que o acesso técnico permita.
