# 03 - Protocolos de Rede e APIs: Tuya / Smart Life

## 🌐 Protocolos Locais Tuya (LAN)

### 1. Descoberta por Broadcast UDP
- **Portas**: UDP `6666` e `6667`
- **Direção**: Dispositivo IoT → Broadcast Subnet (`192.168.1.255`)
- **Frequência**: Heartbeat a cada 5 a 10 segundos
- **Payload v3.1/v3.3**: JSON contendo `ip`, `gwId`, `active`, `productKey`, `version`.
- **Payload v3.4/v3.5**: Frame binário com cabeçalho `0x55AA`, comando `0x13`/`0x08`, tamanho, dados criptografados (AES-ECB com hash MD5 de chave compartilhada Tuya) e checksum final `0xAA55`.

### 2. Controle e Telemetria via TCP (Porta 6668)
- **Porta**: TCP `6668` no IP de cada dispositivo.
- **Protocolo de Aplicação**:
  - **v3.3**: Criptografia AES-128-CBC com `local_key`.
  - **v3.4 / v3.5**: Negociação de sessão com HMAC-SHA256 e cifra de fluxo / GCM para prevenir ataques de repetição e snooping.
- **Estrutura de DPS (Data Points)**:
  - Cada função do aparelho é identificada por um índice numérico:
    - `1`: Geralmente relé principal liga/desliga (`True`/`False`)
    - `2`: Segundo relé (se for 2-gang)
    - `18`, `19`, `20`: Corrente (mA), Potência (W), Tensão (V) em tomadas e disjuntores de medição
    - `9`: Temporizador / Countdown (segundos)

---

## ☁️ API Tuya Cloud (OpenAPI)

- **Endpoints Regionais**:
  - Américas: `https://openapi.tuyaus.com`
  - América Latina / Brasil: `https://openapi.tuyabr.com`
  - Europa: `https://openapi.tuyaeu.com`
- **Autenticação**:
  - `client_id` (Access ID)
  - `secret` (Access Secret)
  - Assinatura HMAC-SHA256 (`sign = HMAC-SHA256(client_id + access_token + t + nonce + stringToSign, secret)`)
- **Extração Automática de Dispositivos**:
  - `GET /v1.0/users/{uid}/devices`
  - Retorna o catálogo completo da conta do SmartLife: nome de exibição, cômodo, categoria, `local_key`, status online/offline e schema de DPS.
