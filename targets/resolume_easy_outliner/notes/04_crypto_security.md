# 04 - Criptografia e Proteção do Formato `.cwired`

## 🔐 Mecanismo de Proteção do Resolume Wire

O formato `.cwired` implementa um envelope de distribuição criptografado projetado para impedir que usuários finais abram o arquivo dentro do Wire Editor.

---

## 🔑 Constantes Criptográficas Identificadas no `WireLib.dll`

### 1. Chave Mestre de 256 bits (Hardcoded em `0x151610`):
```c
static const uint8_t WIRE_MASTER_KEY[32] = {
    0x11, 0xc0, 0x12, 0xc6, 0xa8, 0x57, 0x54, 0xf2,
    0xc3, 0x00, 0x54, 0xf7, 0x41, 0xe9, 0x6f, 0x32,
    0x6b, 0x26, 0x90, 0x80, 0x15, 0xd6, 0x47, 0x59,
    0x49, 0xca, 0x6e, 0x90, 0x22, 0x80, 0x7f, 0x98
};
```

### 2. Algoritmo de Derivação de Chave (KDF):
A rotina em `0x151310` utiliza **SHA-512** com constantes padrão de rodada ($K_0 \dots K_{79}$) localizadas em `0x101D180`:
- **Entrada 1**: Chave mestre de 32 bytes
- **Entrada 2**: String `"source"` (6 bytes)
- **Entrada 3**: String `"effect"` (6 bytes)
- **Entrada 4**: String `"mixer"` (5 bytes)
- **Entrada 5**: Salt de 32 bytes extraído do cabeçalho do arquivo `.cwired` (offset `0x40`)

### 3. Cifra de Fluxo (Stream Cipher):
- A função em `0x153600` implementa uma cifra de fluxo baseada em XOR vetorizado via AVX/SSE (`f3 0f 6f 0a ; 0f 57 c8 ; f3 0f 7f 08`).
- A decodificação aplica XOR em blocos de 64 bytes (`0x40`), gerando em memória o arquivo descompactado `patch.wire`.

---

## 🛡️ Validação de Integridade
O cabeçalho (offset `0x08` a `0x1F`) armazena um digest **SHA-1** de 20 bytes para verificação rápida de corrupção do arquivo antes da tentativa de montagem do bundle em memória.
