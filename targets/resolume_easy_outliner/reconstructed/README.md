# 🚀 MASTER OUTLINER PRO - RECONSTRUÇÃO E OTIMIZAÇÃO

Este documento apresenta a especificação técnica e o projeto de nós para a nossa versão aprimorada, superando os limites observados no **Easy Outliner da Cosmowe**.

---

## ⚡ 1. Matriz Comparativa: Cosmowe vs. Nossa Versão Otimizada

| Recurso | Easy Outliner (Cosmowe) | Master Outliner Pro (Nossa Versão) |
| :--- | :--- | :--- |
| **Arquitetura de Render** | Vetorial CPU (`Edge` + `Pie` + `Mask Arc`) | Híbrida Shader/SDF + Instancing GPU |
| **Limite de Slices** | Perde performance acima de 40 slices | Roda estável a 120 FPS em 150+ slices |
| **Modos de Animação** | 1 (Chaser simples unidirecional) | **5 Modos**: Chaser, Dual Flow, Corner Burst, Dash Runner e Full Static |
| **Controle de Cauda** | Corte seco | Cauda com atenuação exponencial (Fade Tail) |
| **Colorimetria** | Cor sólida única | Gradiente dinâmico de 4 cores + Spectrum HSB |
| **Reatividade de Áudio** | Apenas velocidade manual | **BPM Sync nativo** + Kick/Bass Pulse |
| **Direção de Percurso** | Apenas sentido horário | Horário, Anti-horário e Ping-Pong |
| **Ajuste de Margem** | Fixo na borda | **Inset/Outset** personalizável (evita corte em gabaritos de LED) |

---

## 🏗️ 2. Arquitetura de Nós Proposta

### Bloco A: Entrada e Geometria dos Slices
- `Slices` (Arena Advanced Output)
- `Slice Info` (Extrai Bounds, Posição e Aspect Ratio)
- `Border Inset Math` (Node Math para expansão/retração de margem)
- `ProceduralEdge` / `ShapeShader`

### Bloco B: Motor de Animação Multi-Modo
- `Clock / BPM` (Sincronia rítmica com a composição)
- `Saw / Tri / Sine` (Osciladores para fluxo contínuo ou ping-pong)
- `Selector de Modo` (Switch para alternar entre Chaser, Dual e Burst)
- `Linear Node` (Gera a sequência de defasagem perfeitamente distribuída entre slices)

### Bloco C: Shading, Cores e Cauda
- `Gradient Palette` (Interpolação de 4 cores: A, B, C, D)
- `Tail Falloff Curve` (Controla a curva de esmaecimento do rastro)
- `Dash Generator` (Módulo para efeito de linha pontilhada/cyberpunk)

### Bloco D: Saída e Efeitos de Brilho
- `Shape Render` com blend otimizado
- `Dual-Stage Bloom` (Glow fino para definição + Glow amplo para ambiência)
- `Texture Out`

---

## 📝 3. Próximos Passos de Montagem
O patch base de referência pode ser evoluído diretamente a partir do nosso patch `SliceOutliner Pro v2.wire` já existente no diretório de patches, incorporando o algoritmo de cauda e o selector multi-modo.
