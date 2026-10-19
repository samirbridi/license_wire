# 🔧 REGRA DE VERSIONAMENTO E CHANGELOG

Este projeto segue um sistema de versionamento automático baseado em commits estruturados e rastreabilidade total de evidências.

---

## 📦 FORMATO DE VERSÃO

A versão DEVE seguir exatamente o padrão:

```text
vX.Y.Z (build XXXX)
```

Exemplo:
`v1.4.2 (build 1048)`

Onde:
* **X = Great Version**: Breaking changes (mudança estrutural profunda na engenharia reversa, quebra de compatibilidade em SDKs reconstruídos)
* **Y = Mid Version**: Novas funcionalidades (novos módulos analisados, algoritmos completamente mapeados, novas funções em `reconstructed/`)
* **Z = Low Version**: Correções de bugs (ajuste de offsets, correções de anotações técnicas, refatoração de scripts auxiliares)
* **build XXXX**: Número incremental interno a cada rodada de análise/compilação

---

## 🔢 REGRAS DE INCREMENTO DE VERSÃO

A versão NÃO deve ser definida manualmente. Ela deve ser calculada automaticamente com base nos commits ou registros de descoberta.

### Prioridade de incremento:
1. Se houver `break` ou `BREAKING CHANGE` → incrementar **X** e resetar **Y** e **Z** para 0
2. Senão, se houver `feat` → incrementar **Y** e resetar **Z** para 0
3. Senão → incrementar **Z**

### Regras adicionais:
* Ao incrementar **X** → `Y = 0` e `Z = 0`
* Ao incrementar **Y** → `Z = 0`
* O **build** deve sempre incrementar **+1** a cada nova versão ou análise registrada

---

## 🧾 PADRÃO DE COMMITS (OBRIGATÓRIO)

Todos os commits DEVEM seguir este padrão:

```text
tipo: descrição
```

Tipos permitidos:
* `feat`     → nova funcionalidade analisada/reconstruída
* `fix`      → correção de bug, offset ou interpretação
* `improve`  → melhoria em documentação ou notas
* `perf`     → performance em scripts ou extrações
* `refactor` → refatoração de código ou notas
* `break`    → mudança incompatível ou quebra estrutural

Exemplos:
- `feat(target_abc): mapeia protocolo de handshake de rede`
- `fix(target_xyz): corrige RVA da funcao de validacao de licenca`
- `improve: adiciona script de descompactacao automatica`
- `break: refatora estrutura do SDK reconstruido`

---

## 📜 GERAÇÃO DE CHANGELOG (OBRIGATÓRIA)

A cada nova versão, deve ser gerado automaticamente um changelog estruturado.

Formato:

```markdown
## vX.Y.Z (build XXXX) - YYYY-MM-DD

### 💥 Breaking Changes
- (lista de commits/registros "break")

### ✨ Features
- (lista de commits/registros "feat")

### 🐛 Fixes
- (lista de commits/registros "fix")

### ⚡ Improvements
- (lista de commits/registros "improve", "perf", "refactor")
```

---

## 🔍 RASTREABILIDADE
Cada item do changelog deve ser rastreável a um ID de tarefa/descoberta (ex: `REV-1048`, `FEAT-1050`, `FIX-1052`).
