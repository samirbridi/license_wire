# Vídeo local validado — 2026-10-25

## Resultado comprovado

Autorização QR concluída pelo proprietário e reutilizada pelo go2rtc. A região cn retornou seis câmeras. Foram decodificados quadros reais das seis unidades com FFmpeg para saída nula, sem gravação de imagens.

| Família | Quantidade | Modelo confirmado pela conta | Resultado técnico |
| --- | --- | --- | --- |
| AW300 | 2 | `mxiang.camera.mod11` | 201 e 205 quadros em testes de 10 segundos, 640×360, usando `subtype=sd` |
| Mi 2K | 3 | `isa.camera.hlc7` | Três unidades decodificadas. Duas em 2304×1296 e uma em 640×360 na negociação observada |
| Outdoor Pro | 1 | `xiaomi.camera.cw701` | 201 quadros em 10 segundos, 1280×720 no canal inicial |

Uma Mi 2K foi observada por 30 segundos de mídia, com 592 quadros decodificados e saída FFmpeg sem erro fatal. Isso é uma verificação curta, não estabilidade por horas/dias.

Relatório sem identificadores privados: `evidence/local-video-qa-2026-10-25.json`. Inventário sanitizado: `evidence/camera-inventory-sanitized.json`. IPs, MACs, ID da conta, URLs das fontes e logs estão somente em `evidence/private/` e `runtime/`, ignorados pelo Git.

## Descobertas e correções

1. A consulta Xiaomi retorna um objeto com array `sources`. A primeira contagem do diagnóstico tratou o objeto como uma única câmera; foi corrigida para seis. O auxiliar QR também foi ajustado para esse formato.
2. As AW300 deste proprietário são **mod11**, não mod13. A referência de suporte usada na pesquisa inicial era de outra variante; o resultado local mod11 agora é evidência mais direta para estas unidades.
3. Antes do ajuste de rede, uma câmera de cada família falhou com `read udp ... i/o timeout` e zero quadros.
4. O Windows não tinha regra de aplicação correspondente ao go2rtc. A tentativa inicial de criar uma regra retornou Acesso negado. O script revisável `scripts/enable-camera-udp.ps1` foi então executado via confirmação UAC do Windows; seu recibo privado informa sucesso.
5. A regra permite somente entrada UDP para o executável deste alvo, interface Ethernet em perfil privado, IP local e seis IPs do inventário. Firewall permanece ativo, sem alteração de roteador ou perfil; API continua em loopback. A regra foi mantida porque, após sua aplicação, houve vídeo nas Mi 2K e Outdoor Pro.
6. As AW300 precisaram da variante SD para completar o teste. As fontes principais locais dessas duas unidades foram ajustadas para SD; o inventário original e as variantes de diagnóstico foram preservados.
7. Na Mi 2K, o cabeçalho de entrada inicialmente anuncia 640×360, embora os quadros efetivamente decodificados possam ser 2304×1296. O coletor foi corrigido para separar resolução anunciada da resolução da saída decodificada. Não tratar a primeira linha de metadados como resolução efetiva garantida.

## Reprodução

Usado FFmpeg já disponível no workspace, somente leitura, em `targets/mizin_playout/binaries/qa/ffmpeg/ffmpeg-n8.1-latest-win64-gpl-shared-8.1/bin/ffmpeg.exe`. Não foi alterado nenhum arquivo desse outro alvo.

```powershell
& 'C:\Users\Avell Mizin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -u 'targets/xiaomi_home/scripts/probe-camera-video.py' aw300_garagem mi2k_externa outdoor_pro_poste
& 'C:\Users\Avell Mizin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -u 'targets/xiaomi_home/scripts/probe-camera-video.py' aw300_garagem_sd aw300_portao mi2k_estudio mi2k_sala --read-timeout 30
& 'C:\Users\Avell Mizin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -u 'targets/xiaomi_home/scripts/probe-camera-video.py' aw300_portao_sd --read-timeout 30
& 'C:\Users\Avell Mizin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -u 'targets/xiaomi_home/scripts/probe-camera-video.py' mi2k_externa --duration 30
```

O script usa somente aliases cadastrados no inventário privado e limites de duração. Não salva vídeo. Os cinco testes de fronteira do auxiliar QR passaram novamente após o ajuste da contagem.

## Prévia e limites

Painel local: `http://127.0.0.1:19843/`.

Prévia Mi 2K: `http://127.0.0.1:19843/stream.html?src=mi2k_externa&mode=mse`.

Prévia AW300: `http://127.0.0.1:19843/stream.html?src=aw300_garagem&mode=mse`.

Prévia Outdoor Pro: `http://127.0.0.1:19843/stream.html?src=outdoor_pro_poste&mode=mse`.

Esses fluxos usam H.265. Reprodução no navegador depende do suporte do navegador/dispositivo e ainda não foi verificada visualmente pelo agente. Uma prévia foi encaminhada ao painel do Codex, sem tratar o retorno queued como prova de abertura ou reprodução.

Permanecem pendentes: áudio, latência de ponta a ponta, HD nas AW300, acesso aos três sensores da Outdoor Pro, PTZ/zoom, cartão SD, renovação de sessão, clientes Android/Windows próprios, acesso externo e integrações Google Home/SmartLife. Ainda não houve novo aplicativo publicado.

## Próxima decisão de arquitetura

Foi perguntado ao usuário se aceita um Windows/central/NAS ligado no local ou precisa operar com computadores desligados. O teste atual depende do Windows e da ponte local. Não presumir que esse desenho atende ao acesso remoto final sem essa decisão.

Para remover apenas a regra criada, executar como administrador:

```powershell
.\targets\xiaomi_home\scripts\enable-camera-udp.ps1 -Remove
```
