# Liberar a porta RTSP da ponte (8554) só para este PC, no firewall do DSM

Isso corresponde à decisão que você já aprovou (sessão de 1/11): "Abrir porta só para este PC". A
mudança no `bridge.yaml` (ver `bridge-rtsp-enable.md`) faz o RTSP escutar em `:8554` (todas as
interfaces do NAS); o firewall do DSM é quem de fato restringe quem consegue chegar nela — sem essa
regra, a porta ficaria aberta para toda a rede local, não só para este PC.

## Passo a passo (DSM, Painel de Controle)

1. **Painel de Controle → Segurança → Firewall** (se o firewall nunca foi usado antes, pode pedir para
   habilitar primeiro — habilitar não derruba nada em si, só passa a existir uma lista de regras).
2. Na lista de perfis de firewall, **Editar Regras** do perfil ativo (geralmente "Default" nas instalações
   que nunca mexeram nisso).
3. **Criar** uma nova regra:
   - **Portas**: Personalizado → TCP → `8554`
   - **IP de origem**: Endereço IP específico → `192.168.1.30` (o IP atual deste PC — confirme que não
     mudou, veja a nota abaixo)
   - **Ação**: Permitir
4. Mover essa regra para **antes** de qualquer regra genérica de bloqueio que já exista (a ordem importa:
   regras são avaliadas de cima para baixo, a primeira que bater decide).
5. Confirme que uma regra existente continua permitindo o acesso ao próprio DSM (porta 5001) antes de
   salvar — alterar o firewall tem risco real de bloquear o próprio acesso administrativo se a ordem das
   regras for descuidada. Os guias da comunidade Synology destacam isso especificamente.
   [Fonte: wundertech.net, mariushosting.com]
6. Salvar e aplicar.

## Nota sobre o IP deste PC

`192.168.1.30` foi confirmado nesta sessão (1/11/2026) via `Get-NetIPAddress`. Se o roteador reatribuir
esse IP no futuro (DHCP sem reserva fixa), a regra de firewall para de funcionar silenciosamente — o
Frigate simplesmente não vai mais conseguir conectar, sem mensagem de erro óbvia do lado do NAS.
**Recomendado**: reservar `192.168.1.30` para este PC nas configurações de DHCP do roteador (fora do
escopo do DSM, é configuração do roteador), para a regra não depender de o IP nunca mudar.

## Verificação

Depois de salvar a regra e reiniciar o container `bridge` (ver `bridge-rtsp-enable.md`):

```bash
# Deste PC (192.168.1.30) - deve conectar:
ffprobe -rtsp_transport tcp "rtsp://frigate:SENHA@192.168.1.186:8554/aw300_portao_quality3"
```

Se quiser confirmar que a regra de fato restringe por IP (não deixou aberto para toda a LAN por engano),
o teste equivalente rodado de qualquer outro dispositivo da rede (celular na mesma rede, outro PC) deveria
falhar em conectar — esse teste cruzado não foi feito nesta sessão porque exigiria acesso físico a um
segundo dispositivo; vale rodar manualmente depois de aplicar a regra, antes de considerar isso concluído.
