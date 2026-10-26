# Acesso, recursos nativos e referências adicionais

Consulta: 2026-10-26. Objetivo do proprietário: alcançar os recursos existentes em cada modelo, incluindo SD, PTZ/zoom/rondas quando presentes, fala e acesso remoto por link/login. Não equivale a compatibilidade total já comprovada.

## Recuperação do acesso local

O endereço simples da central não leva o convite de pareamento. O convite inicial expira em uma hora e é de uso único; a sessão resultante dura até 30 dias neste navegador. Não é um código enviado pela Xiaomi.

`Abrir-Central.cmd`, executado pelo proprietário neste Windows, usa o inicializador existente para reiniciar somente a central, gerar um convite novo e abrir o navegador padrão. Sessões existentes são preservadas; visualizações ativas podem reconectar durante esse reinício. A ponte de vídeo não é substituída. Um navegador conectado pode usar **Sua central → Vincular outro navegador**, gerando um convite local de dez minutos sem reiniciar o serviço. Os links completos ficam privados em `runtime/central/local-access.json`; não devem ser publicados.

## Referências examinadas

| Referência | Evidência útil | Limite para este alvo |
|---|---|---|
| [kisharora/go2rtc](https://github.com/kisharora/go2rtc) | Fork MIT; conexão CS2 pela nuvem, comandos de motor e backchannel de áudio. Commit consultado `76b3e456c2f1dda97cce9f2797a668818e165488`. | Documentação inclui desenvolvimento específico da região Índia e etapas históricas incompletas. Não prova os nossos modelos/China. HD/SD no README é qualidade de vídeo, não leitura de cartão SD. Não foi instalado em substituição à ponte estável. |
| [PC-Office/mi-camera-ha-rtsp-guide](https://github.com/PC-Office/mi-camera-ha-rtsp-guide) | Implantação por Docker, go2rtc e alternativa micam/Miloco; experiências com câmeras externas/múltiplas vistas. | Guia de transmissão e firewall, sem prova de calendário SD, download ou rondas das nossas unidades. |
| [Songmanual/MijiaDeck](https://github.com/Songmanual/MijiaDeck) | Cliente Windows com prévia remota e movimento por arraste, usando micam. | README declara câmera experimental, modelo testado diferente e licença de distribuição do componente micam não confirmada. Não copiar componentes desse pacote para nosso app. |
| [wangty163/ha_xiaomi_home](https://github.com/wangty163/ha_xiaomi_home) | Variante de integração Xiaomi Home. | Árvore consultada não inclui plataforma camera; licença restrita ao uso pessoal não comercial no Home Assistant. |
| [XiaoMi/xiaomi-miloco](https://github.com/XiaoMi/xiaomi-miloco) | Projeto oficial com vídeo/áudio, canais múltiplos, diagnósticos e conexão local. | Licença própria limita o uso ao projeto Miloco não comercial e exclui reutilização para outros apps/web services. Não incorporado ao app independente. |
| [al-one/hass-xiaomi-miot](https://github.com/al-one/hass-xiaomi-miot) | MIoT e propriedades de aparelhos, útil para identificar recursos expostos por modelo. | Na [issue 1744](https://github.com/al-one/hass-xiaomi-miot/issues/1744), referente a `isa.camera.hlc7`, o mantenedor diz não oferecer live streaming e encaminha ao micam. Detectar entidades não prova vídeo estável. |
| [thecrypt0/yi-hack-v4](https://github.com/thecrypt0/yi-hack-v4) | Firmware alternativo para câmeras Yi e chipsets específicos. | Não há correspondência comprovada com CW701, mod11 e hlc7. Não foi aplicado firmware. |

## Onde executar

Hoje o processo de autenticação/transporte/transcodificação está neste Windows, portanto o protótipo depende dele ligado. Não é uma exigência permanente de usar Windows: pode-se portar a central para Linux/NAS/mini-PC; o dimensionamento deve considerar até duas vistas por cliente e a transcodificação hoje acelerada por GPU.

`homecams.pages.dev` é uma sugestão de nome, não um endereço reservado ou publicado. [Pages](https://developers.cloudflare.com/pages/get-started/direct-upload/) fornece o domínio do frontend; [R2](https://developers.cloudflare.com/r2/how-r2-works/) armazena objetos/clipes. Nenhum deles, isoladamente, executa a conexão proprietária das câmeras. Login/sinalização podem usar Workers e a entrega de vídeo pode usar [Realtime/TURN](https://developers.cloudflare.com/realtime/turn/), com custos a validar.

Uma VPS poderia executar o conector fora da residência se a conexão CS2 remota for comprovada para a conta/modelos/China. Isso requer teste fora da LAN e verificação de todas as funções pelo transporte remoto. Não significa câmera independente da nuvem Xiaomi. [Containers](https://developers.cloudflare.com/containers/concepts/architecture/) recebe tráfego de usuários por Worker/HTTP; não assumimos que seja um substituto direto para um servidor UDP/P2P. Nenhum serviço pago, exposição pública ou envio de credenciais/imagens à Cloudflare foi realizado nesta etapa.

## Ordem de validação

1. Resolver a sessão de comandos independente por consulta de informações, sem movimentar câmera.
2. Consultar catálogo SD com timestamps reais; depois replay, recorte local e download, sem apagar ou formatar.
3. Validar comando de movimento com parada, limites, lente correta e controle de zoom específico do modelo.
4. Ler posições/rondas existentes antes de oferecer gravação/edição de rotas.
5. Negociar áudio de retorno, codec e encerramento do microfone mediante ação do usuário.
6. Testar conector remoto com conta própria, depois publicar frontend/login e validar em outra rede.

O teste de firewall preparado em `scripts/test-readonly-with-firewall.ps1` restringe a liberação temporária ao executável com SHA validado, interface privada existente e um único IP da Outdoor. Executa apenas a consulta `device-info`, encerra o processo em até 45 segundos e remove a regra no bloco de limpeza. Precisa de UAC do Windows. Ele não comprova por si só que o firewall seja a causa do problema.
