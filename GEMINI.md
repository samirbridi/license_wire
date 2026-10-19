# GEMINI.MD - WORKSPACE INSTRUCTIONS FOR ANTIGRAVITY & GEMINI

Consulte [AGENTS.md](AGENTS.md) para as regras fundamentais de engenharia reversa.

## Recursos Disponíveis no Antigravity:
1. **Ghidra MCP Integrado**:
   - `ghidra-mcp`: `list_instances`, `connect_instance`, `debugger_*`, `import_file`.
   - Permite depurar processos nativos, monitorar memória, registrar breakpoints e inspecionar chamadas diretamente pelo MCP.
2. **REA CLI & Scripts**:
   - `npx -y rea-agents` via terminal powershell para dissecação estática de Electron, ASAR, binários PE/ELF/Mach-O e APKs.
3. **Isolamento Estrito**:
   - Criar ou trabalhar apenas dentro de `targets/<target-name>/`.
4. **Padrão de Versionamento**:
   - `vX.Y.Z (build XXXX)` com changelog estruturado obrigatório.
