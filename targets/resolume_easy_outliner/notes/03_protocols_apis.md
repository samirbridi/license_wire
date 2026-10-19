# 03 - Protocolos, APIs e Integração com Arena

## 📡 Integração com Resolume Arena Advanced Output

O Easy Outliner se comunica com o Arena através do barramento interno de texturas e nós do Wire:
- **`usesSlices = true`**: Esta flag no `ProjectMeta` instrui o Resolume Arena a injetar a lista completa de polígonos e transformações de slices no nó `Slices` (`77697265-e61f-42c0-812a-0dca04e74562`).
- **Dimensões Virtuais vs Físicas**: O patch opera no espaço normalizado do Composition Output do Arena, permitindo escalonamento automático sem perda de resolução.

---

## 🎛️ Parâmetros Expostos no Painel do Arena
O plugin expõe controles padronizados via `wire::runtime`:
1. **Speed**: Velocidade do percurso do outline (frequência do oscilador Saw).
2. **Arc Length**: Comprimento do feixe em graus/radianos (abertura do nó Pie).
3. **Slice Offsets**: Padrão de defasagem (linear, aleatório ou agrupado).
4. **Color**: Cor principal (RGB ou HSL).
5. **Glimmering / Bloom**: Intensidade do brilho e modulação de flicker.
6. **Stroke Width**: Espessura da borda gerada no nó `Edge`.
