# 🔬 METODOLOGIA DE ENGENHARIA REVERSA

Este documento estabelece o protocolo técnico para realização de engenharia reversa neste repositório, garantindo precisão científica, reprodutibilidade e conformidade legal e técnica.

---

## 1. 🛡️ PRINCÍPIO DA ANÁLISE BASEADA EM EVIDÊNCIAS
Nenhuma afirmação sobre o funcionamento de uma função, algoritmo ou protocolo deve ser baseada em suposições da IA.
Toda conclusão deve ter **evidência técnica rastreável**:
- **Offset / RVA**: Endereço virtual ou deslocamento no arquivo (ex: `.text:0x004012F0`).
- **Símbolo / Assinatura**: Nome exportado, importado ou mangled.
- **Decompilação**: Trecho de pseudocódigo Ghidra ou bytecode CIL/Java comprovando o comportamento.
- **Tráfego / IPC**: Payload capturado e validado.

Todas as evidências brutas devem ser salvas na pasta `evidence/` do respectivo alvo.

---

## 2. 🏗️ CLEAN-ROOM REVERSE ENGINEERING (ENGENHARIA REVERSA LIMPA)
Ao reconstruir código, bibliotecas ou plugins com base em software proprietário:
1. **Fase de Análise (Dirty Room)**:
   - Dissecação do binário, mapeamento de structs, decodificação de payloads e análise do fluxo de controle.
   - Documentação da especificação abstrata na pasta `notes/` (ex: "Entrada: JSON com campos X, Y; Saída: HMAC-SHA256 codificado em Base64").
2. **Fase de Reconstrução (Clean Room)**:
   - Implementação de código limpo na pasta `reconstructed/` baseado **exclusivamente** nas especificações abstratas anotadas, sem copiar código-fonte proprietário ou descompilações cruas com nomes protegidos.

---

## 3. ⚙️ PIPELINE DE ANÁLISE POR TIPO DE ALVO

### A. Aplicativos Desktop Electron / Node.js
1. Extração e desempacotamento de ASAR (`rea` ou `npx asar extract`).
2. Análise estática com REA:
   ```powershell
   npx -y rea-agents analyze-javascript-application "caminho" --json
   ```
3. Mapeamento de canais IPC (`ipcRenderer.send`, `ipcMain.handle`).
4. Reconstituição de fontes limpos em `reconstructed/`.

### B. Binários Nativos (PE Windows / ELF Linux / Mach-O)
1. Extração de hashes e metadados (`SHA256SUMS.txt`).
2. Varredura com REA para visão geral:
   ```powershell
   npx -y rea-agents analyze "binario.exe" --provider ghidra --json
   ```
3. Importação para Ghidra com auto-análise ativada.
4. Identificação de strings, tabelas de importação (IAT), funções criptográficas e referências cruzadas (`xrefs`).
5. Uso do **Ghidra MCP** para depuração dinâmica ou inspeção de memória em tempo de execução quando necessário.

### C. Aplicativos Android (APK / AAB)
1. Inventário e projeção de grafo de aplicação:
   ```powershell
   npx -y rea-agents project-android-application-graph "caminho.apk" --json
   ```
2. Decompilação de classes com JADX ou JEB.
3. Rastreamento de chamadas nativas JNI (`.so`) para Ghidra.

### D. Plugins / Bibliotecas (.NET / CIL / C++)
1. Inspeção de metadados PE/CLI com REA.
2. Análise de limites P/Invoke e chamadas gerenciadas para código nativo:
   ```powershell
   npx -y rea-agents verify-managed-native-boundaries "assembly.dll" --json
   ```
3. Descompilação CIL (ILSpy / Ghidra).
