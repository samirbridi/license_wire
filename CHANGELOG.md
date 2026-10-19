# 📜 CHANGELOG GLOBAL - REA & ENGENHARIA REVERSA

Registro central de versões e atualizações da infraestrutura de engenharia reversa do workspace.
Cada alvo específico possui seu próprio `CHANGELOG.md` em `targets/<alvo>/CHANGELOG.md`.

---

## v0.1.0 (build 1) - 2026-10-19

### ✨ Features
- feat: inicializa ambiente unificado de engenharia reversa com suporte ao REA (`morluto/rea`) e Ghidra MCP
- feat: implementa sistema de templates isolados para alvos em `targets/_template/`
- feat: adiciona scripts de automação `tools/new-target.ps1` e `tools/bump-version.ps1`

### ⚡ Improvements
- improve: cria regras de compatibilidade multi-IDE em `AGENTS.md`, `CLAUDE.md` e `GEMINI.md`
- improve: define especificações metodológicas em `.rules/RE_METHODOLOGY.md`, `.rules/TARGET_SPEC.md` e `.rules/VERSIONING_CHANGELOG.md`
- improve: configura `.gitignore` robusto com proteção para binários pesados e artefatos de análise
