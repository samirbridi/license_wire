## v3.0.0 (build 022) - 2026-10-19

### 💥 Breaking Changes
- **Arquitetura v3**: Nova versão de produto com pipeline híbrido de geometria e render de textura unificada.

### ✨ Features
- **Merge Slices (Modo Pórtico)**: Fusão contínua de slices contíguos com detecção de borda Sobel dinâmica para pórticos e testeiras de LED.
- **BPM Sync**: Integração com relógio de transporte do Resolume Arena e multiplicadores rítmicos.
- **Direction Control**: Controle de sentido de traçador (Normal, Inverted, Ping-Pong).
- **Dual Head Flow & Collision**: Fluxo duplo espelhado com flash de colisão aditiva.
- **Segmented Border Area**: Seletor rápido de botões no dashboard `[ Full Frame ] [ Slices ]`.

### ⚡ Improvements
- **Otimização Zero GPU Bypass**: O nó de Edge Detection agora possui bypass automático acoplado ao toggle `Merge Slices`, eliminando qualquer overhead de GPU quando inativo.
- **Assinatura Interna v3**: Rodapé e identificador atualizados para `by Mizin | v3.0.0`.
