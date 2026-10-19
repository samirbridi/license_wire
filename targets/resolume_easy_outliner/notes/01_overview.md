# 01 - Visão Geral do Alvo: Easy Outliner (.cwired)

## 🔍 Informações Básicas
- **Nome do Arquivo**: `Easy Outliner.cwired`
- **Autor Original**: Cosmowe (disponibilizado via marketplace Juicebar para Resolume Arena)
- **Tamanho**: 867.412 bytes (~847 KB)
- **SHA-256**: `9CDEEB771D19788A6CB2288F6F82BFAA19D2EE453618D1CB5D5A6F770C944E87`
- **Ambiente Alvo**: Resolume Wire / Resolume Arena 7.x
- **Formato**: `wire::bundle` compilado e não-editável (`compiled-uneditable`)

---

## 📦 Estrutura do Pacote `.cwired`
Diferente dos patches abertos `.wire` (que são puramente JSON legível), o `.cwired` é um arquivo binário protegido:
1. **Cabeçalho (Offset 0x00 a 0x7F - 128 bytes)**:
   - `0x00 - 0x07`: Assinatura e versão de formato (`00 01 00 00 00 01 00 00`)
   - `0x08 - 0x1F`: Checksum SHA-1 (20 bytes) para integridade do payload
   - `0x40 - 0x53`: Salt / IV de derivação criptográfica (20 bytes)
   - `0x54 - 0x7F`: Padding de zeros (alinhamento em 128 bytes)
2. **Payload Criptografado (Offset 0x80 em diante)**:
   - Stream criptografado com chave derivada via **SHA-512** e chave mestre hardcoded no `WireLib.dll`.
   - Contém o pacote virtual `wire::bundle` com `patch.wire` (o grafo de nós em JSON), metadados de presets e recursos embutidos.

---

## 🎯 Finalidade e Comportamento Observado
- **Função Principal**: Gera contornos animados (strokes, chasers e runners) sincronizados com o mapeamento de painéis de LED e telas do **Advanced Output** do Resolume Arena.
- **Diferencial Comercial**: Funciona sem necessidade de licença ativa do Resolume Wire, sendo executável diretamente como Source Plugin no Resolume Arena.
