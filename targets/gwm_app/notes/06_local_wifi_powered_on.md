# Central ligada: rede acessível e serviço AirTunes identificado

Coleta iniciada em 2026-10-27, 23:54 de São Paulo, e concluída após 00:01 de 2026-10-28. O proprietário confirmou GWM ORA 5 2026/2027, Coffee OS 3, veículo estacionado em P, central ligada e IP mantido em `192.168.1.119`. A versão completa do firmware ainda não foi informada. O proprietário não encontrou opções visíveis de desenvolvedor/depuração.

## Estado Atual e Próximos Passos

**Conectividade LAN confirmada; acesso ao sistema operacional e à telemetria não obtido.** O endereço informado passou a responder quando o proprietário ligou a central. A correlação e o IP confirmado pelo proprietário sustentam a associação com o carro, mas não constituem identificação autenticada do hardware.

1. Obter a versão completa do firmware pela tela de informações da central. Caso o proprietário não encontre a tela, uma foto dos menus pode orientar a navegação sem presumir um caminho específico.
2. Identificar uma interface de diagnóstico documentada ou obter legitimamente um APK/pacote de atualização para análise estática no REA/Ghidra. Não foi recebido firmware nem extraído software nesta coleta.
3. Definir quais recursos da multimídia ou integrações de leitura interessam ao proprietário. A presença de AirTunes não demonstra capacidade de instalar aplicativos, habilitar recursos ou acessar telemetria.

## Evidências observadas

### Identificação de rede

- Primeira repetição com a central ligada: ping 2/2, 95 e 16 ms, TTL 64. Portas TCP 80, 443, 8080, 8443 e 5555 recusaram conexão (`ECONNREFUSED`).
- Coleta reproduzível: [`../evidence/lan-probe-2026-10-28T02-56-20.657Z.json`](../evidence/lan-probe-2026-10-28T02-56-20.657Z.json), gerada por `scripts/probe-local-network.mjs`.
- Nessa coleta, ping 2/2, 107 e 51 ms, TTL 64; MAC ARP `30:4A:C4:79:46:D5`.
- Das 18 portas TCP selecionadas, somente **7000** aceitou conexão. As outras 17 expiraram nessa segunda coleta. Resultados variaram entre as coletas; não representar todos os serviços como permanentemente fechados.
- TTL não identifica de forma conclusiva sistema operacional, distribuição ou versão Android.

### Porta 7000

| Consulta de leitura | Resposta observada | Evidência |
| --- | --- | --- |
| HTTP `HEAD /` | `501 Not Implemented`; `Server: AirTunes/450.14.1` | `service-7000-http-head-20261027.txt` |
| HTTP `GET /info` | `455 Method Not Valid In This State`; corpo vazio | `service-7000-info-20261027.headers.txt` e `.plist` |
| RTSP `OPTIONS *` | `200 OK`; `Server: AirTunes/450.14.1` | `service-7000-rtsp-options-20261027.json` |
| HTTP `GET /server-info` | `404 Not Found`; corpo vazio | `service-7000-server-info-20261027.headers.txt` e `.body` |

O cabeçalho `Public` de OPTIONS declarou `ANNOUNCE, SETUP, RECORD, PAUSE, FLUSH, TEARDOWN, OPTIONS, POST, GET, PUT, GET_PARAMETER`. A declaração não prova que métodos sejam utilizáveis sem uma sessão ou autenticação. Nenhum dos métodos de reprodução, configuração ou escrita foi executado.

**Interpretação:** o cabeçalho e o protocolo apontam para um componente de mídia da família AirTunes/AirPlay. A Apple relaciona TCP 7000 a AirPlay. A função exata do componente na implementação GWM, sua relação com CarPlay e o modelo do hardware não foram confirmados. `450.14.1` é a versão anunciada pelo serviço; **não é a versão do Coffee OS 3**. O código 455 não comprova sozinho necessidade de autenticação ou pareamento.

### Descoberta limitada ao mesmo IP

Consultas DNS PTR unicast para `_airplay._tcp.local`, `_raop._tcp.local` e `_services._dns-sd._udp.local` no servidor `192.168.1.119:5353` terminaram em `ETIMEOUT`. Nenhum multicast/broadcast foi enviado. Evidência: `service-discovery-unicast-20261027.json`. Essa modalidade limitada não exclui anúncios mDNS por multicast.

### Consulta de documentação

A página oficial de manuais foi consultada por navegador de pesquisa. Não foi identificado de forma confiável um link do manual ORA 5. O primeiro extrator local não encontrou links; a repetição mostrou HTTP 406. O arquivo `official-ora-manual-links-20261027.json` registra somente o resultado vazio do extrator, não a inexistência de um manual. Não orientar o proprietário com um caminho de menu de outro modelo.

## Comandos e requisições

Diretório de execução: `D:\REA - ENGENHARIA REVERSA`.

```powershell
node.exe --check targets/gwm_app/scripts/probe-local-network.mjs
node.exe targets/gwm_app/scripts/probe-local-network.mjs
curl.exe --noproxy '*' --connect-timeout 2 --max-time 5 --head 'http://192.168.1.119:7000/' 2>&1 | Tee-Object -FilePath 'targets\gwm_app\evidence\service-7000-http-head-20261027.txt'
curl.exe --silent --show-error --noproxy '*' --connect-timeout 2 --max-time 5 --max-filesize 65536 --dump-header 'targets\gwm_app\evidence\service-7000-info-20261027.headers.txt' --output 'targets\gwm_app\evidence\service-7000-info-20261027.plist' 'http://192.168.1.119:7000/info'
curl.exe --silent --show-error --noproxy '*' --connect-timeout 2 --max-time 5 --max-filesize 65536 --dump-header 'targets\gwm_app\evidence\service-7000-server-info-20261027.headers.txt' --output 'targets\gwm_app\evidence\service-7000-server-info-20261027.body' 'http://192.168.1.119:7000/server-info'
```

O script limita o alvo ao IP informado, 18 portas fixas, quatro sockets simultâneos, timeout de 1500 ms e zero payload TCP. Requer acesso de rede fora da restrição do sandbox. Não realiza identificação de aplicação; as consultas HTTP/RTSP foram etapas separadas.

Payload RTSP enviado por socket Node.js, integralmente preservado no recibo em texto e Base64:

```text
OPTIONS * RTSP/1.0\r\nCSeq: 1\r\nUser-Agent: LocalReadOnlyProbe/1.0\r\n\r\n
```

Descoberta DNS: `new dns.promises.Resolver({timeout:1500,tries:1})`, `setServers(['192.168.1.119:5353'])`, `resolvePtr` para cada um dos três nomes registrados. Nenhum resultado PTR, SRV ou TXT foi obtido.

## Limites desta etapa

Nenhum login, pareamento, instalação, início de mídia, leitura de CAN/ECU, escrita de configuração, comando veicular ou acesso à nuvem My GWM. Nenhuma função foi habilitada. Não houve análise REA/Ghidra nesta coleta por ausência de artefato do veículo. Os corpos vazios foram preservados como evidência das respostas; não são firmware nem arquivos extraídos.

## Referências primárias

- [Apple — portas TCP/UDP](https://support.apple.com/en-us/103229): associação de TCP 7000 a AirPlay.
- [AOSP — Architecture of ADB Wi-Fi](https://android.googlesource.com/platform/packages/modules/adb/+/HEAD/docs/dev/adb_wifi.md): em implementações Android compatíveis, depuração sem fio pode usar pareamento e porta dinâmica. Não confirma que o Coffee OS deste carro exponha esse recurso; testar 5555 não exclui todas as formas de ADB.
- [IETF RFC 6762](https://www.rfc-editor.org/rfc/rfc6762.html): contexto de mDNS e consultas unicast limitadas.
