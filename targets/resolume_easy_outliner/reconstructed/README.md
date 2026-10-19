# SliceOutliner Pro v3

**Source** para **Resolume Wire** — gera uma moldura com degradê de até 4 cores, cantos arredondados individualmente, modo quadro inteiro, por slice ou modo pórtico com fatias unificadas, traçadores sincronizados com BPM, fluxo duplo e colisão. A saída tem fundo transparente: coloque em uma layer acima do conteúdo.

| | |
|---|---|
| **Autor** | Mizin |
| **Versão** | v3.0.0 |
| **Build** | 022 |
| **Data** | 2026-10-19 |
| **Categoria** | Source |
| **Testado em** | Resolume Wire 7.28.1 |
| **Arquivo** | `SliceOutliner Pro v3.wire` / `SliceOutliner Pro v3.cwired` |

Nomes do dashboard em inglês para uso universal; documentação e notas técnicas em português.

---

## 🚀 Superpoderes da Versão 3 (v3.0.0)

1. **Merge Slices (Modo Pórtico)**:
   - Permite unificar visualmente as bordas de múltiplos slices contíguos (ex: testeiras, pórticos, totens e painéis em 'L').
   - Elimina as emendas e divisórias internas indesejadas, gerando apenas o contorno externo unificado.
   - **Otimização Zero GPU**: Utiliza bypass dinâmico no shader de convolução Sobel. Quando desativado, consome 0% de GPU extra.

2. **BPM Sync Nativo**:
   - Sincronização rítmica precisa do movimento dos traçadores (`Tracer`) com o clock master do Resolume Arena.
   - Multiplicadores/divisores musicais dedicados para acompanhar o tempo do show.

3. **Direction Control (Fluxo e Ping-Pong)**:
   - Modos de direção: Normal (horário), Invertido (anti-horário) e Ping-Pong suave (vai e volta contínuo).

4. **Dual Head Flow & Collision**:
   - Modo de duplo traçador: permite fluxo em direções opostas com efeito de colisão e flash aditivo nos pontos de encontro das cabeças de luz.

5. **Interface e Dashboard Renovados**:
   - Seletor `Border Area` rápido com botões segmentados `[ Full Frame ] [ Slices ]`.
   - Toggle dedicado de `Merge Slices` integrado à seção `INPUT`.
   - Agrupamento limpo e ergonômico de todos os 59 parâmetros.

---

## Instalação

1. A pasta `SliceOutliner Pro v3/` deve ficar em `Documentos/Resolume Wire/Patches/`.
2. No Resolume Arena o patch aparece na lista de **Sources** (aba Files ➔ Sources).
3. Arraste para um clip em uma layer acima do conteúdo que deve receber a moldura.
