# Leituras independentes de SD e posições — 2026-10-27

Diagnóstico compilado automaticamente como v0.10.0 (build 0016), fonte `dcc463800c5d5f65708975a57596de18f2a74e57`. Esta evidência é do executável independente; não representa validação integral das alterações posteriores/concorrentes na ponte `go2rtc-miss-patch` ou no portal Tuya.

## Resultado nas câmeras do proprietário

Consultas efetuadas entre 11:45 e 11:50 de 2026-10-27, America/Sao_Paulo, pela API HTTPS Xiaomi, região China, com a autorização existente. Sem comandos de movimento, formatação, ejeção ou alteração de propriedades.

| Câmera | Consulta das quatro propriedades SD | Estado informado |
|---|---|---|
| Outdoor Pro (Poste) | Passou | 0 — normal |
| AW300 (Garagem) | Passou | 0 — normal |
| AW300 (Portão) | Passou | 0 — normal |
| Mi 2K (Sala) | Passou | 0 — normal |
| Mi 2K (Externa) | Passou | 0 — normal |
| Mi 2K (Estúdio) | Passou após uma repetição por falha de rede | 3 — SD-No-Work |

O estado 3 é uma resposta do dispositivo, não um diagnóstico de dano físico. Convém conferir a mensagem da câmera no Xiaomi Home. Não houve tentativa de reparar ou formatar o cartão.

Os valores total/livre/usado são preservados como inteiros nativos, com `unit: null`. A especificação consultada não define uma unidade útil para todos os modelos. A diferença de escala entre AW300 e CW701/HLC7 não autoriza uma conversão universal. Uma resposta MIoT válida não comprova leitura dos arquivos de vídeo, catálogo, replay ou exportação.

## Posições e ronda da Outdoor

As três propriedades retornaram código 0:

- Serviço 9, propriedade 1: JSON com seis entradas, cada uma com `location`, `idx`, `pos` (três componentes inteiros), `zoom` e `name`; todas nomeadas e com posição não nula.
- Serviço 9, propriedade 2: valor numérico da propriedade de posição ativa.
- Serviço 10, propriedade 7: objeto JSON com lista `position`; as seis referências correspondem aos índices das seis entradas.

Nomes, coordenadas e respostas completas permanecem em `evidence/private/readonly-positions-*.json`. As unidades dos componentes `pos`, a escala de `zoom`, o comportamento de seleção e o estado de execução/horários da ronda não foram confirmados por essa consulta. Não basta a lista existir para afirmar que a ronda está ativa. Nenhum movimento foi enviado.

## Execução reproduzível

```powershell
$target = (Resolve-Path targets/xiaomi_home).Path
$probe = Join-Path $target 'runtime/builds/build-0016/diagnostics/xiaomi-readonly.exe'
& $probe --target $target --camera outdoor_pro_poste --read storage-status
& $probe --target $target --camera outdoor_pro_poste --read positions
```

`storage-status` aceita os três modelos cadastrados. `positions` aceita apenas CW701. `device-info` mantém o diagnóstico P2P restrito à CW701. Modelos/IDs não cadastrados e operações arbitrárias são rejeitados. A lista fixa consulta apenas `/miotspec/prop/get`; nenhum endpoint de escrita foi adicionado.

Os testes Go verificam a lista de consultas contra os schemas MIoT guardados em `evidence/miot-spec`, além da rejeição de operações de escrita e modelos desconhecidos. As dependências oficiais ficam em cache exclusivo `runtime/go-readonly-modules`, separado do cache usado pela ponte modificada, e `go mod verify` passou. Os oito testes do versionamento passaram, incluindo o caso em que VERSION está à frente de release-state.json; o novo build não reutilizou o número 0015.

## Evidências e limites

- [Recibo de consultas sanitizado](../evidence/builds/20261027-readonly-camera-qa.json): oito tentativas, incluindo a falha transitória do Estúdio, seis leituras SD concluídas e uma leitura das posições.
- [Build do diagnóstico](../evidence/builds/20261027-storage-read-01-readonly.json): hash, commit e versão. `hardwareTested: false` registra a etapa de compilação; a validação posterior está no recibo de consultas.
- [Consulta P2P anterior](../evidence/builds/20261026-cs2-device-info-qa.json): resposta real `device-info`, com remoção da regra temporária de firewall.

Próximos passos: confirmar unidades e estados na interface, adaptar o catálogo/replay/download nativo, validar seleção de posição e zoom com observação da câmera, e só depois edição de rondas e fala. O transporte de vídeo remoto também precisa de teste fora da LAN. `homecams.pages.dev` está reservado por projeto Pages vazio; não é ainda uma central remota publicada.

A ponte em desenvolvimento contém uma tabela de estados SD que diverge dos schemas: estado 2 significa falta de espaço, 4 formatação e 5 ejeção nos modelos consultados. Também não deve tratar resposta ausente/erro MIoT como estado normal nem deduzir unidade apenas por um limiar numérico. Esses pontos foram registrados para integração; os arquivos dessa ponte já estavam modificados e foram preservados nesta etapa.
