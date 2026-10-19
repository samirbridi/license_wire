# 02 - Arquitetura de Nodes e Fluxo do Easy Outliner

## 🏛️ Fluxo de Dados do Grafo (Dataflow Graph)

A engenharia reversa do padrão arquitetural do Easy Outliner revelou a seguinte cadeia de nós:

```mermaid
graph TD
    S[Slices: Captura do Advanced Output] --> SI[Slice Info: Dimensões e Formas]
    SI --> E[Edge: Conversão de Polígono em Contorno]
    
    Saw[Saw: Oscilador Rampa] --> AP[Add Phase: Soma de Fase]
    SO[Slice Offsets: Padrão de Deslocamento] --> AP
    AP --> Sp[Spin: Rotação Angular]
    
    Pie[Pie: Geometria de Setor Circular] --> Sp
    Sp --> MP[Merge Pies: Fusão das Máscaras Rotativas]
    
    E --> MA[Mask Arc: Interseção Booleana Edge x Pie]
    MP --> MA
    
    C[Color: Paleta / Cor do Traço] --> SR[Shape Render: Rasterizador GPU]
    MA --> SR
    
    SR --> M[Merge: Composição de Camadas]
    M --> B[Bloom: Brilho / Glow Pós-Processado]
    Glim[Glimmering: Modulação de Flicker] --> B
    B --> TO[Texture Out: Saída de Vídeo para Arena]
```

---

## 🧩 Detalhamento dos Nós Principais

| Node | ID de Classe | Papel no Efeito |
| :--- | :--- | :--- |
| **Slices** | `77697265-e61f-42c0-812a-0dca04e74562` | Coleta a geometria de todos os slices ativos no Arena. |
| **Slice Info** | `77697265-39D3-41B8-BECE-237802F83E9F` | Decompõe os slices em shapes vetoriais, centros e bounds. |
| **Edge** | `77697265-ab950887-37ee-4fd2-9487-c856b6b75c83` | Converte o preenchimento do slice em traço perimetral (borda). |
| **Saw** | `77697265-F95F-41D8-8FC4-DF0DC56E1051` | Gerador de rampa cíclica contínua (0 a 1) para o movimento. |
| **Slice Offsets** | `77697265-A48B-4AF9-8975-E3063B037D4C` | Gera defasagem de fase para que os slices não corram todos juntos. |
| **Pie** | `77697265-cd66-44d5-b414-74e8c11c805c` | Gera uma "fatia de pizza" cuja abertura define o comprimento do feixe de luz. |
| **Spin** | `77697265-9225-4009-9D2D-5F898E94CC33` | Gira o setor circular conforme o tempo/fase do Saw. |
| **Mask Arc** | `77697265-48f0-48c6-93df-afe8984d360b` | **O segredo do efeito:** faz a máscara booleana entre a borda retangular e o setor giratório. Somente o ponto onde eles se cruzam fica visível, criando o traçador perimétrico. |
| **Shape Render** | `77697265-EA26-47D6-985A-B4D5DC314BF7` | Converte as curvas matemáticas em textura raster na placa de vídeo. |
| **Bloom** | `77697265-B994-4A9A-94E7-B4E0FA77D8AF` | Adiciona dispersão luminosa (glow neon) sobre as bordas. |

---

## ⚡ Gargalos de Performance Identificados na Versão Cosmowe
1. **Interseção Vetorial CPU/GPU**: O uso de nós de máscara booleana geométrica (`Mask Arc` com `Pie`) recalcula interseções de polígonos. Quando o palco possui mais de 40 slices, isso causa quedas de frame.
2. **Falta de Shader SDF**: Não utiliza distância com sinal (Signed Distance Fields), o que impede cantos arredondados contínuos e transições de degradê suave na cauda do feixe.
3. **Ausência de Reatividade de Áudio Direta**: Depende de parâmetros manuais de velocidade em vez de extração nativa por bandas de frequência (BPM/FFT).

---

## 🚀 Arquitetura Expandida do Nosso Plugin: `SliceOutliner Pro v2`

Em comparação ao design restrito do Easy Outliner (18 nós), o `SliceOutliner Pro v2` utiliza uma pipeline avançada de **306 nós e 58 parâmetros expostos**, com shader de mapeamento UV contínuo e injeção de superpoderes via API REST ao vivo:

### 1. BPM Sync Engine
- **`Transport Info`** (`77697265-66b1-4c28-a5a9-1f64026d769b`): Extrai o BPM global da composição do Resolume Arena em tempo real.
- **`Bpm to Frequency`** (`77697265-d6a0-423f-99f8-608fa5e03e97`): Converte o andamento musical em frequência em Hertz.
- **`BPM Multiplier`**: Multiplicador paramétrico (0.125x a 8x) para divisões rítmicas (semínimas, colcheias, compassos inteiros).
- **`BPM Switch`**: Alternador suave entre velocidade manual em Hertz e sincronização automática com a batida da música.

### 2. Controle de Sentido e Movimento (Direction Control)
- **Horário / Direto**: Oscilador dente-de-serra padrão (`Saw Oscillator` `0.0 -> 1.0`).
- **Anti-horário / Reverso**: Inversor de rampa (`1 - x` `1.0 -> 0.0`) acionado por `Tracer Reverse`.
- **Ping-Pong (Vai-e-Volta)**: Oscilador triangular unipolar (`Triangle Oscillator` `0.0 <-> 1.0`) acionado por `Tracer Ping-Pong`.

### 3. Traçador Duplo & Choque de Luz (Dual Head Collision)
- **Modo Twin (180°)**: Adiciona defasagem de 0.5 envolta por `Fract` para criar duas cabeças simétricas que orbitam o perímetro.
- **Modo Mirror / Choque**: Inverte o sentido da segunda cabeça (`1 - Phase`), fazendo as duas viajarem em sentidos opostos.
- **Fusão Aditiva de Choque (`Add` + `Clamp`)**: No instante em que as duas cabeças colidem nos cantos dos slices, suas intensidades de brilho somam-se criando um flash duplo explosivo na tela de LED.
- **`Dual Head Switch`**: Ativação instantânea no painel do Arena com mapeamento direto para botões MIDI.
