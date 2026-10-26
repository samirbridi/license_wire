# 02 - Arquitetura de Unificação: Tuya + Xiaomi + Portal + Google Home

## 🏛️ Visão Geral da Arquitetura Unificada

O objetivo é transformar a automação residencial em um sistema centralizado, local, ultrarrápido e livre das instabilidades dos aplicativos em nuvem:

```mermaid
graph TD
    subgraph "Camada de Dispositivos (Casa)"
        TUYA["12+ Dispositivos Tuya/SmartLife<br/>(Tomadas, Relés, Disjuntores DIN)"]
        XIAOMI["6 Câmeras Xiaomi<br/>(Outdoor Pro 2K, AW300, Mi 2K)"]
    end

    subgraph "Camada de Gateway & Controladores Locais (Windows Host / Central)"
        GO2RTC["go2rtc Bridge<br/>(RTSP / WebRTC / HLS local)"]
        TINYTUYA["Tuya Local Controller<br/>(TCP 6668 / tinytuya)"]
    end

    subgraph "Camada de Painel & Plataforma (Estilo Home Assistant)"
        PORTAL["Central Unificada Mizin Home<br/>(Dashboard Web / PWA)"]
        HASS["Home Assistant Core / OS<br/>(Opcional / Motor de Regras)"]
    end

    subgraph "Camada de Controle Externo & Voz"
        GH["Google Home / Google Assistant<br/>(Voz no Carro / Android Auto / Celular)"]
        CLOUDFLARE["Cloudflare Tunnel / R2<br/>(Acesso Externo Seguro sem VPN)"]
    end

    TUYA -->|TCP 6668 Local AES| TINYTUYA
    XIAOMI -->|P2P / RTSP Local| GO2RTC
    TINYTUYA --> PORTAL
    GO2RTC -->|H.264 / WebRTC baixa latência| PORTAL
    PORTAL <--> HASS
    HASS <--> GH
    PORTAL <--> CLOUDFLARE
    CLOUDFLARE <--> GH
```

---

## 🔑 Pilares de Implementação

1. **Tuya Local Control**:
   - Controle direto sem passar pelos servidores da China/EUA.
   - Resposta instantânea (< 50ms) para ligar/desligar luzes, disjuntores e tomadas.
   - Leitura de potência, tensão e consumo em tempo real.

2. **Xiaomi Câmeras (Integrado)**:
   - Aproveita a base validada em `targets/xiaomi_home` (Mizin Câmeras).
   - 6 câmeras decodificadas com H.264/WebRTC via go2rtc.

3. **Integração com Google Home (Voz no Carro / Celular)**:
   - Duas vias de ligação:
     - **Via Home Assistant**: Integração nativa Google Assistant (expõe todas as entidades para o app Google Home via Cloudflare Tunnel ou Nabu Casa).
     - **Via Tuya / Smart Life Cloud**: Mantém a vinculação nativa do Tuya com Google Home para os interruptores/disjuntores existentes, enquanto o painel local assume a visualização de alta performance.
