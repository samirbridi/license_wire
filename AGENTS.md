# 🧭 AGENTS.MD - DIRETRIZES GLOBAIS DE ENGENHARIA REVERSA

> **Ambiente Multi-IDE**: Este projeto é compartilhado entre **Antigravity**, **Claude Code** e **Codex**. Todos os agentes DEVEM respeitar rigorosamente estas diretrizes para manter a continuidade e a integridade das análises.

---

## 1. 🎯 OBJETIVO DO REPOSITÓRIO
Este repositório é dedicado à **Engenharia Reversa e Análise de Software, Aplicativos, Plugins e Firmwares**.
Utilizamos como motor principal de evidências e orquestração o **REA (Reverse Engineer Anything)** (`morluto/rea`) integrado ao **Ghidra** (via MCP e CLI local).

---

## 2. 🗂️ REGRA DE ISOLAMENTO DE ALVOS (OBRIGATÓRIO)
**Cada software, app, plugin ou biblioteca analisada DEVE possuir uma pasta exclusiva e isolada sob o diretório `targets/`.**

> ⚠️ **NUNCA misture arquivos de alvos diferentes.**
> Cada pasta de alvo é autossuficiente e possui seu próprio histórico, evidências, notas e versionamento.

### Estrutura Padrão de um Alvo (`targets/<nome-do-alvo>/`):
```text
targets/<nome-do-alvo>/
├── README.md               # Visão geral do alvo, arquitetura observada e objetivos
├── CHANGELOG.md            # Registro detalhado das descobertas por versão/build
├── VERSION                 # Arquivo de versão no formato vX.Y.Z (build XXXX)
├── binaries/               # Arquivos originais analisados (DLLs, EXEs, APKs, etc.)
│   └── SHA256SUMS.txt      # Hashes de integridade (SHA-256) dos binários
├── evidence/               # Saídas brutas de ferramentas (REA JSON, relatórios, grafos)
├── ghidra/                 # Scripts headless, anotações de base Ghidra, símbolos
├── notes/                  # Anotações técnicas estruturadas da análise:
│   ├── 01_overview.md      # Superfície de ataque e pontos de entrada
│   ├── 02_architecture.md  # Módulos internos e fluxo de controle
│   ├── 03_protocols_apis.md# Protocolos de rede, IPC, APIs internas
│   └── 04_crypto_security.md# Chaves, hashes, licenças, packing e proteções
├── scripts/                # Scripts utilitários (Python, Frida, unpackers, decoders)
└── reconstructed/          # Código limpo reconstruído (re-implementações e SDKs)
```

Para inicializar um novo alvo de forma padronizada, execute:
```powershell
.\tools\new-target.ps1 -TargetName "<nome-do-alvo>" -Description "<breve descricao>"
```

---

## 3. 🛠️ FERRAMENTAS & FLUXO DE REVERSA

### 3.1. REA (Reverse Engineer Anything)
Disponível via CLI local (`npx -y rea-agents`) ou chamadas MCP.
- **Análise JavaScript/Electron**:
  ```powershell
  npx -y rea-agents analyze-javascript-application "caminho/do/app" --json
  ```
- **Visão geral e símbolos de binários**:
  ```powershell
  npx -y rea-agents analyze "caminho/do/binario" --provider ghidra --json
  ```
- **Evidência primeiro**: Sempre anexe as descobertas com base em evidências verificadas (endereços, offsets, strings Ghidra, xrefs) e armazene na pasta `evidence/`.

### 3.2. Ghidra & Ghidra MCP
Ghidra está disponível na máquina local. O Ghidra MCP fornece comandos de depuração e inspeção:
- Inspeção de instâncias: `list_instances`, `connect_instance`
- Análise de memória e registradores: `debugger_read_memory`, `debugger_registers`
- Rastreamento e breakpoints: `debugger_trace_function`, `debugger_set_breakpoint`
- Importação estática: `import_file`

---

## 4. 📦 REGRA DE VERSIONAMENTO E CHANGELOG (OBRIGATÓRIA)

Todo o repositório e **cada alvo individualmente** seguem rigorosamente o padrão de versionamento:

### Formato da Versão:
`vX.Y.Z (build XXXX)`  
Exemplo: `v1.2.0 (build 1042)`

- **X (Great Version)**: Breaking changes, reestruturação profunda ou mudança de paradigma de análise.
- **Y (Mid Version)**: Novas funcionalidades mapeadas, novos módulos analisados, nova lógica reconstruída.
- **Z (Low Version)**: Correções de documentação, ajustes em scripts, correções de anotações.
- **build XXXX**: Número incremental a cada execução/ciclo de análise.

### Padrão de Commits:
`tipo: descrição`
- `feat`: nova funcionalidade mapeada ou reconstruída
- `fix`: correção de endereço, offset ou interpretação errônea
- `improve`: melhoria de documentação ou script de análise
- `perf`: otimização de script ou extração
- `refactor`: reorganização de anotações ou código reconstruído
- `break`: quebra de compatibilidade ou reescrita estrutural

### Padrão de Changelog (`CHANGELOG.md`):
```markdown
## vX.Y.Z (build XXXX) - YYYY-MM-DD

### 💥 Breaking Changes
- (itens com 'break')

### ✨ Features
- (itens com 'feat')

### 🐛 Fixes
- (itens com 'fix')

### ⚡ Improvements
- (itens com 'improve', 'perf', 'refactor')
```

---

## 5. 🔄 TRANSIÇÃO ENTRE IDES (Antigravity ↔ Claude Code ↔ Codex)
Para garantir que outro agente (ou humano) possa continuar o trabalho imediatamente:
1. **Mantenha o `README.md` do alvo atualizado** com a seção `## Estado Atual e Próximos Passos`.
2. **Documente os hashes** dos arquivos na pasta `binaries/SHA256SUMS.txt`.
3. **Registre os comandos exatos** executados no REA ou scripts desenvolvidos.
4. **Atualize o `CHANGELOG.md`** ao concluir cada sessão ou milestone de análise.
