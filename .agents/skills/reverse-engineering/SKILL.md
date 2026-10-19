---
name: reverse-engineering
description: Protocolo de engenharia reversa com REA (Reverse Engineer Anything) e Ghidra MCP no repositório REA - ENGENHARIA REVERSA.
---

# REA & GHIDRA REVERSE ENGINEERING SKILL

## Visão Geral
Esta skill orienta agentes (Antigravity, Claude Code, Codex) no fluxo de trabalho de engenharia reversa no workspace `d:\REA - ENGENHARIA REVERSA`.

## 1. Princípio do Isolamento por Alvo
- Cada software analisado DEVE residir em `targets/<nome-do-alvo>/`.
- Para criar novo alvo: `.\tools\new-target.ps1 -TargetName "<nome>" -Description "<descricao>"`.
- NUNCA crie arquivos soltos na raiz ou misture evidências de alvos diferentes.

## 2. Ferramentas Primárias
1. **REA (Reverse Engineer Anything)**:
   - CLI: `npx -y rea-agents`
   - Exemplos de comandos:
     - `npx -y rea-agents analyze-javascript-application "<caminho>" --json`
     - `npx -y rea-agents analyze "<caminho_binario>" --provider ghidra --json`
     - `npx -y rea-agents project-android-application-graph "<caminho.apk>" --json`
     - `npx -y rea-agents verify-managed-native-boundaries "<caminho.dll>" --json`
2. **Ghidra & Ghidra MCP**:
   - Use o servidor Ghidra MCP para conectar instâncias, ler memória, inspecionar registradores e colocar breakpoints.

## 3. Regras de Versionamento e Changelog
- Formato: `vX.Y.Z (build XXXX)`
- Commits obrigatórios: `feat:`, `fix:`, `improve:`, `perf:`, `refactor:`, `break:`
- Cada alvo possui seu `CHANGELOG.md` e `VERSION`.
- Use `.\tools\bump-version.ps1 -Target "<alvo>" -Type "<tipo>" -Message "<descricao>"` para atualizar versão e changelog.

## 4. Handoff Multi-IDE
- Ao encerrar a sessão, atualize o `README.md` do alvo na seção de próximos passos.
- Documente tudo em `evidence/` e `notes/`.
