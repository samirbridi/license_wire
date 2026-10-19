# 📁 ESPECIFICAÇÃO DE ESTRUTURA DE ALVO (TARGET SPEC)

Cada aplicativo, plugin ou software investigado DEVE possuir uma pasta exclusiva sob `targets/<nome-do-alvo>/`.
O nome do diretório deve ser em letras minúsculas, com hífens ou underlines (ex: `photoshop_plugin_xyz`, `slack_desktop`, `custom_firmware_v2`).

---

## 🗂️ MATRIZ DE ARQUIVOS POR ALVO

| Diretório / Arquivo | Finalidade | Regra de Versionamento / Git |
| :--- | :--- | :--- |
| `README.md` | Resumo executivo do alvo, superfície de ataque, status da análise e checklist de tarefas pendentes | Versionado no Git |
| `CHANGELOG.md` | Histórico cronológico das descobertas, módulos dissecados e versões do alvo | Versionado no Git |
| `VERSION` | String pura contendo `vX.Y.Z (build XXXX)` | Versionado no Git |
| `binaries/` | Binários brutos (.exe, .dll, .apk, .asar). **NÃO versionar arquivos pesados.** | Ignorado pelo Git |
| `binaries/SHA256SUMS.txt` | Lista com hashes SHA-256 e tamanhos dos binários analisados | Versionado no Git |
| `evidence/` | Dumps de strings, saídas JSON do REA, relatórios de analisadores, logs | Versionado no Git (texto/JSON) |
| `ghidra/` | Scripts Java/Python de Ghidra, anotações de structs, mapas de memória exportados | Versionado no Git |
| `notes/` | Caderno de notas da análise reversa dividido em tópicos claros | Versionado no Git |
| `scripts/` | Ferramentas auxiliares criadas para o alvo (decoders, scrapers, unpackers) | Versionado no Git |
| `reconstructed/` | Código-fonte limpo reimplementando as funções descobertas (SDKs, APIs, clones) | Versionado no Git |

---

## 📝 TEMPLATE DAS NOTAS TÉCNICAS (`notes/`)

1. **`01_overview.md`**:
   - Tipo de software (Arquitetura x86_64/ARM, linguagens, compilador, packing/ofuscação).
   - Pontos de entrada, listeners de rede e arquivos de configuração.
2. **`02_architecture.md`**:
   - Diagrama de blocos dos módulos.
   - Fluxo de dados principal e máquinas de estado.
3. **`03_protocols_apis.md`**:
   - Estrutura de pacotes de rede (TCP, UDP, WebSockets, HTTP REST/GraphQL).
   - Definição de structs de IPC (canais Electron, Named Pipes, Shared Memory).
4. **`04_crypto_security.md`**:
   - Algoritmos criptográficos encontrados (AES, RSA, ECC, etc.).
   - Localização de chaves, IVs, rotinas de validação de licença ou assinatura.
