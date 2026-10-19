# 🎯 ALVO: resolume_easy_outliner

> **Descrição**: Engenharia Reversa e análise de nodes do plugin Easy Outliner (.cwired) para Resolume Wire  
> **Versão da Análise**: `v0.2.0 (build 2)`  
> **Atualizado em**: 2026-10-19

---

## 📊 1. Informações do Alvo
- **Categoria**: Resolume Arena Source Plugin (`.cwired`)
- **Autor Original**: Cosmowe (Juicebar Marketplace)
- **Tamanho do Binário**: 867.412 bytes
- **SHA-256**: `9CDEEB771D19788A6CB2288F6F82BFAA19D2EE453618D1CB5D5A6F770C944E87`
- **Engine de Execução**: Resolume Wire / `WireLib.dll`
- **Proteção**: Envelope de distribuição compilado não-editável (`wire::bundle`) com chave mestre de 256 bits e derivação SHA-512

---

## 🎯 2. Objetivos da Engenharia Reversa
- [x] Identificar formato interno do binário `.cwired` e cabeçalho de 128 bytes
- [x] Mapear chave mestre e algoritmo de derivação KDF no `WireLib.dll`
- [x] Descobrir a arquitetura exata de nós e o segredo do efeito (Interseção `Edge` x `Pie` rotativo)
- [x] Identificar gargalos de performance da versão comercial
- [x] Criar blueprint de reconstrução otimizada com 5 modos de animação e render acelerado

---

## 📍 3. Estado Atual e Próximos Passos (Multi-IDE Sync)
*Atualizado por: Antigravity*

### Concluído recentemente:
- [x] Cópia e validação de hash em `binaries/SHA256SUMS.txt`
- [x] Análise estática do motor de carregamento no `WireLib.dll` (`0x151310` e `0x153600`)
- [x] Descoberta do grafo de nós no arquivo `evidence/easy_outliner_nodes.json`
- [x] Documentação técnica completa em `notes/01_overview.md`, `notes/02_architecture.md`, `notes/03_protocols_apis.md` e `notes/04_crypto_security.md`
- [x] Blueprint de otimização em `reconstructed/README.md`

### Próximos passos prioritários:
1. Montar a versão expandida no Resolume Wire com o blueprint do `reconstructed/README.md`
2. Implementar shader de cauda com atenuação suave e reatividade de BPM

---

## 📂 4. Guia Rápido dos Arquivos do Alvo
- `binaries/`: Contém `Easy Outliner.cwired` e `SHA256SUMS.txt`
- `evidence/`: `easy_outliner_nodes.json` com mapeamento detalhado de IDs de classe dos nós
- `notes/`: 4 capítulos técnicos detalhando o formato, nós, APIs e criptografia
- `scripts/`: `analyze_wire.py` para inspeção de arquivos Wire
- `reconstructed/`: Especificação da nossa versão aprimorada (Master Outliner Pro)
