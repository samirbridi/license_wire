# 05 - Inventário Detalhado de Dispositivos Tuya / Smart Life na Rede Local

Varredura e sondagem profunda concluída em 2026-10-25 na sub-rede `192.168.1.0/24`.

---

## 📊 Resumo Consolidado

- **Total de Dispositivos Conectados na Rede**: 41
- **Dispositivos Tuya/Smart Life Confirmados no Protocolo**: **15 dispositivos**
- **Dispositivos Espressif (Candidatos Tuya/Sonoff)**: **4 dispositivos**
- **Total Potencial de Hardware Tuya/IoT**: **19 dispositivos físicos**
- **Canais / Teclas Virtuais Estimados**: Mais de 25 canais no app Smart Life (devido a relés multicanais 2-gang/3-gang)

---

## 📋 Lista dos 15 Dispositivos Tuya Confirmados

| # | Endereço IP | Device ID (`gwId`) | Versão | Product Key | Hardware / Função Identificada | Hostname DNS |
| :-: | :--- | :--- | :---: | :--- | :--- | :--- |
| **1** | `192.168.1.48` | `ebaee623fb...` | **v3.5** | `key5ckdnys3pqgec` | Interruptor de Parede Moes/Tuya | - |
| **2** | `192.168.1.65` | `eb786ebb97...` | **v3.4** | `keyjup78v54myhan` | Tomada Inteligente 16A c/ Medição | - |
| **3** | `192.168.1.70` | `ebddcf7465...` | **v3.4** | `rt90jaznls6wlq5j` | Câmera / Interfone IP Tuya (RTSP 554 + TCP 6668) | `IPC.localdomain` |
| **4** | `192.168.1.80` | `eb5911cf82...` | **v3.3** | `keyfa7hya4gfa7g9` | Módulo / Interruptor Tuya v3.3 | - |
| **5** | `192.168.1.84` | `eb6227b63a...` | **v3.5** | `keyfxuj3d5wg53wx` | Interruptor / Relé Multicanal (2 Canais) | `lwip0.localdomain` |
| **6** | `192.168.1.92` | `ebce2ea581...` | **v3.5** | `rw34oa0bvgg3arsh` | Medidor Trifásico de Energia Kowsi DIN | - |
| **7** | `192.168.1.102` | `0070600140...` | **v3.3** | `keyf9fsmuufeywsr` | Módulo / Interruptor Tuya v3.3 | `ESP_1AAD58.localdomain` |
| **8** | `192.168.1.112` | `ebb5f986e1...` | **v3.5** | `u0cxoxtfelys3ufx` | Disjuntor Medidor TOMZN TOMPD-63SW DIN | - |
| **9** | `192.168.1.146` | `ebe317c237...` | **v3.5** | `keyfxuj3d5wg53wx` | Interruptor / Relé Multicanal (2 Canais) | - |
| **10** | `192.168.1.192` | `eb49c5d197...` | **v3.4** | `key8tg9kykj4g8dw` | Módulo / Interruptor Tuya v3.4 | - |
| **11** | `192.168.1.208` | `eb75753e5d...` | **v3.4** | `keyjup78v54myhan` | Tomada Inteligente 16A c/ Medição | - |
| **12** | `192.168.1.211` | `eba364bce4...` | **v3.4** | `key5ckdnys3pqgec` | Interruptor de Parede Moes/Tuya | - |
| **13** | `192.168.1.222` | `eb7f7b175b...` | **v3.5** | `4kfqpaat5buefsv0` | Dispositivo de Controle / Disjuntor Tuya | - |
| **14** | `192.168.1.226` | `ebce5d26e6...` | **v3.3** | `keym4vvjhx4sd9kk` | Módulo / Interruptor Tuya v3.3 | - |
| **15** | `192.168.1.242` | `eb1d9c1e1b...` | **v3.5** | `key5ckdnys3pqgec` | Interruptor de Parede Moes/Tuya | `wlan0.localdomain` |

---

## 🔍 Candidatos Espressif Adicionais (Possíveis Tuya / Sonoff / ESPHome)

| # | Endereço IP | Endereço MAC | Fabricante Chip | Observações |
| :-: | :--- | :--- | :--- | :--- |
| **16** | `192.168.1.22` | `E4:AA:EC:93:72:D9` | Espressif Inc. | Módulo ESP32 / ESP8266 |
| **17** | `192.168.1.85` | `E4:AA:EC:FC:A9:36` | Espressif Inc. | Hostname: `xiaomi.localdomain` (Módulo integrado) |
| **18** | `192.168.1.126` | `E4:AA:EC:AC:69:F0` | Espressif Inc. | Módulo ESP32 / ESP8266 |
| **19** | `192.168.1.225` | `E4:AA:EC:93:73:3B` | Espressif Inc. | Módulo ESP32 / ESP8266 |

---

## 🏠 Outros Dispositivos Relevantes da Casa

- **Gateway Zigbee / Bluetooth**: `192.168.1.183` (`lumi_gateway_mgl03.localdomain` - Xiaomi/Aqara Multimode Gateway)
- **Câmeras Xiaomi**: 6 unidades nas faixas `.58`, `.83`, `.165`, `.196`, `.218`, `.230`
- **Roteadores Xiaomi Mesh**: 4 nós nas faixas `.25`, `.67`, `.106`, `.115` (`MiWiFi-RA80`)
- **Infraestrutura UniFi**: Gateway `192.168.1.1` e Switch PoE `192.168.1.16` (`USW-Lite-8-PoE`)
- **Google Home / Assistente**: `192.168.1.213` (`Google-Nest-Mini.localdomain`) e `192.168.1.104` (Smart TV)
