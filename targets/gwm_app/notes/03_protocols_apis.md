# 03 - Protocolos, Endpoints e Dicionário de Telemetria (GWM Ora)

## 1. Endpoints REST (Região Brasil)

| Serviço | Método | URL Completa | Requisitos |
| :--- | :--- | :--- | :--- |
| **Login da Conta** | `POST` | `https://br-front-service.gwmcloud.com/br-official-commerce/br-official-gateway/pc-api/api/v1.0/userAuth/loginAccount` | Headers `GW_PC_GWM`, Body `{ deviceid, account, password: md5(pass) }` |
| **Listar Veículos** | `GET` | `https://br-app-gateway.gwmcloud.com/app-api/api/v1.0/globalapp/vehicle/acquireVehicles` | mTLS + Header `accessToken` |
| **Status / Telemetria** | `GET` | `https://br-app-gateway.gwmcloud.com/app-api/api/v1.0/vehicle/getLastStatus?vin={VIN}&flag=true` | mTLS + Header `accessToken` |
| **Info Básica / Config A/C** | `GET` | `https://br-app-gateway.gwmcloud.com/app-api/api/v1.0/vehicle/vehicleBasicsInfo?vin={VIN}&flag=true` | mTLS + Header `accessToken` |
| **Enviar Comando T5** | `POST` | `https://br-app-gateway.gwmcloud.com/app-api/api/v1.0/vehicle/T5/sendCmd` | mTLS + `accessToken` + `securityPassword: md5(PIN)` |
| **Status do Comando** | `GET` | `https://br-app-gateway.gwmcloud.com/app-api/api/v1.0/vehicle/getRemoteCtrlResultT5?seqNo={SEQ}&vin={VIN}` | mTLS + Header `accessToken` |
| **Histórico de Recarga** | `POST` | `https://br-app-gateway.gwmcloud.com/app-api/api/v1.0/vehicleCharge/getChargeLogs` | mTLS + Body `{ vin, pageNum: "1", pageSize: "100", continuation: "0" }` |
| **Agendar Recarga** | `POST` | `https://br-app-gateway.gwmcloud.com/app-api/api/v1.0/vehicleCharge/setChargingPlan?vin={VIN}` | mTLS + Body `{ enable, startTime, endTime, seqNo, planType: "1", vin }` |

---

## 2. Headers Obrigatórios

### 2.1. No Login (`br-front-service.gwmcloud.com`)
```json
{
  "appid": "6",
  "brand": "6",
  "brandid": "CCZ001",
  "country": "BR",
  "devicetype": "0",
  "enterpriseid": "CC01",
  "gwid": "",
  "language": "pt_BR",
  "rs": "5",
  "terminal": "GW_PC_GWM"
}
```

### 2.2. Na API de Veículos (`br-app-gateway.gwmcloud.com`)
```json
{
  "rs": "2",
  "terminal": "GW_APP_GWM",
  "brand": "6",
  "language": "pt_BR",
  "systemtype": "2",
  "regioncode": "BR",
  "country": "BR",
  "accessToken": "<JWT_ACCESS_TOKEN>",
  "refreshToken": "<JWT_REFRESH_TOKEN>"
}
```

---

## 3. Dicionário de Códigos de Telemetria (`getLastStatus -> data.items`)

### 🔋 Bateria EV, Recarga e Autonomia
| Código | Descrição | Unidade / Valores | Notas de Conversão |
| :--- | :--- | :--- | :--- |
| `2013021` | **Estado de Carga (SoC)** | `%` (0–100) | Nível principal da bateria de tração |
| `2011501` | **Autonomia EV** | `km` | Autonomia elétrica estimada restante |
| `2013022` | **Tempo Restante de Carga** | `min` | Minutos até concluir a recarga |
| `2041142` | **Estado de Carregamento** | Enum (`0`..`6`) | `0`=Desconectado/Parado, `1`=Carregando, `2`=Aguardando, `3`=Concluído, `5`=Esperando Energia, `6`=Erro |
| `2042082` | **Plugue CCS2 Conectado** | `0` / `1` | `1`=Cabo conectado, `0`=Desconectado |
| `2013023` | **Agendamento de Carga Ativo** | `0` / `1` | Indica se há cronograma ativo |
| `2042071` | **Temperatura da Bateria de Tração** | `°C` | Temperatura do pack de alta tensão |
| `2013005` | **Bateria Auxiliar 12V (SoC)** | `%` | Alerta < 80%, Crítico < 50% |
| `2103010` | **Hodômetro (Quilometragem Total)** | `km` | Total acumulado do veículo |

### 🛞 Pneus (TPMS — Pressão e Temperatura)
| Código | Descrição | Unidade Bruta | Conversão para PSI |
| :--- | :--- | :--- | :--- |
| `2101001` | Pressão Pneu Dianteiro Esquerdo (FL) | `kPa` | `Math.round(val * 0.145038 * 10) / 10` |
| `2101002` | Pressão Pneu Dianteiro Direito (FR) | `kPa` | `Math.round(val * 0.145038 * 10) / 10` |
| `2101003` | Pressão Pneu Traseiro Esquerdo (RL) | `kPa` | `Math.round(val * 0.145038 * 10) / 10` |
| `2101004` | Pressão Pneu Traseiro Direito (RR) | `kPa` | `Math.round(val * 0.145038 * 10) / 10` |
| `2101005` | Temperatura Pneu Dianteiro Esquerdo (FL) | `°C` | Direto |
| `2101006` | Temperatura Pneu Dianteiro Direito (FR) | `°C` | Direto |
| `2101007` | Temperatura Pneu Traseiro Esquerdo (RL) | `°C` | Direto |
| `2101008` | Temperatura Pneu Traseiro Direito (RR) | `°C` | Direto |
| `2102001`–`2102004` | Alerta de Pressão (FL, FR, RL, RR) | `0`=Normal | Status de alarme TPMS |

### 🚪 Portas, Travas, Vidros e Teto Solar
| Código | Descrição | Estados |
| :--- | :--- | :--- |
| `2208001` | **Trava Central das Portas** | `0` = **Trancado**, `1` = **Destrancado** |
| `2206001` | **Porta-Malas** | `0` = Fechado, `1` = Aberto |
| `2206002` | Porta Dianteira Esquerda (Motorista) | `0` = Fechada, `1` = Aberta |
| `2206004` | Porta Dianteira Direita (Passageiro) | `0` = Fechada, `1` = Aberta |
| `2206003` | Porta Traseira Esquerda | `0` = Fechada, `1` = Aberta |
| `2206005` | Porta Traseira Direita | `0` = Fechada, `1` = Aberta |
| `2212001` | Capô Dianteiro | `0` = Fechado, `1` = Aberto |
| `2210001` | Vidro Dianteiro Esquerdo | `1` = Fechado, `2` = Aberto, `3` = Entreaberto |
| `2210002` | Vidro Dianteiro Direito | `1` = Fechado, `2` = Aberto, `3` = Entreaberto |
| `2210003` | Vidro Traseiro Esquerdo | `1` = Fechado, `2` = Aberto, `3` = Entreaberto |
| `2210004` | Vidro Traseiro Direito | `1` = Fechado, `2` = Aberto, `3` = Entreaberto |
| `2210005` | **Posição do Teto Solar** | `3` = Fechado (valores != 3 indicam abertura) |

### ❄️ Climatização e Conforto da Cabine
| Código | Descrição | Unidade / Estados |
| :--- | :--- | :--- |
| `2202001` | **Estado do Ar-Condicionado** | `0` = Desligado, `1` = Ligado |
| `2201001` | **Temperatura Interna da Cabine** | `°C` (Nota: em alguns modelos vem em décimos de grau, ex: `235` -> `23.5 °C`, ou inteiro direto) |
| `2202099` | Purificador de Ar / Ionizador | `0` = Desligado, `1` = Ligado |
| `2078020` | Recirculação de Ar do Cockpit | `0` = Desligado, `1` = Ligado |
| `2222001` | Desembaçador Dianteiro | `0` = Desligado, `1` = Ligado |
| `2210032` | Desembaçador Traseiro | `0` = Desligado, `1` = Ligado |
| `2060016` | Aquecimento do Volante | `0` = Desligado, `1` = Ligado |
| `2220001` / `2220002` | Aquecimento Banco Motorista / Passageiro | `0` = Desligado, `1..3` = Nível |
| `2220003` / `2220004` | Ventilação Banco Motorista / Passageiro | `0` = Desligado, `1..3` = Nível |
| `4105008` | Sinal da Rede Móvel 4G (T-Box) | Intensidade de sinal |
| `2310001` | Autorização de GPS Ativa | `1` = Autorizado, `0` = Não autorizado |
