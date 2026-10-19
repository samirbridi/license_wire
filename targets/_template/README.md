# 🎯 ALVO: {{TARGET_NAME}}

> **Descrição**: {{TARGET_DESCRIPTION}}  
> **Versão da Análise**: `v0.1.0 (build 1)`  
> **Criado em**: {{DATE}}

---

## 📊 1. Informações do Alvo
- **Categoria**: [Desktop App / Plugin / Mobile APK / DLL / Firmware / CLI]
- **Arquitetura**: [x86 / x64 / ARM64 / AnyCPU]
- **Linguagem Principal**: [C++ / C# (.NET) / Rust / Go / Electron (Node.js) / Java]
- **Proteções Detectadas**: [Nenhuma / ASLR / DEP / VMProtect / Enigma / Obfuscator.NET / ProGuard]

---

## 🎯 2. Objetivos da Engenharia Reversa
- [ ] Mapear arquitetura geral e fluxo de inicialização
- [ ] Identificar protocolos de comunicação e formatos de mensagens
- [ ] Analisar proteções de licença / validação de segurança
- [ ] Reconstruir especificações ou SDK limpo em `reconstructed/`

---

## 📍 3. Estado Atual e Próximos Passos (Multi-IDE Sync)
*Atualizado por: [Antigravity/Claude/Codex]*

### Concluído recentemente:
- [x] Criação da estrutura base do alvo

### Em andamento:
- [ ] Coleta de binários e cálculo de hashes em `binaries/SHA256SUMS.txt`

### Próximos passos prioritários:
1. Executar análise preliminar via REA (`npx -y rea-agents analyze ...`)
2. Importar binário principal no Ghidra para extração de símbolos e strings

---

## 📂 4. Guia Rápido dos Arquivos do Alvo
- `binaries/`: Binários originais intactos e `SHA256SUMS.txt`
- `evidence/`: Saídas JSON do REA, dumps de memória, strings
- `ghidra/`: Scripts Ghidra e anotações de base
- `notes/`: Caderno de análise estruturado (`01_overview.md`, etc.)
- `scripts/`: Scripts auxiliares de automação e teste
- `reconstructed/`: Código limpo desenvolvido a partir das descobertas
- `CHANGELOG.md`: Histórico de descobertas e builds
