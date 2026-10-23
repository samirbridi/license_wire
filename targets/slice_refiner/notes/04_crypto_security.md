# Contêiner Wire v1: formato verificado

Evidência estática: WireLib.dll instalado, SHA-256
`577fcef3fb0bdf6fff502f133ffe44024a9d662074952bd7571380c3e5757a05`.
Endereços virtuais referem-se a essa imagem x64: base 0x180000000.

| Campo | Offset | Leitura |
|---|---|---|
| Versão | 0 | u16 big-endian = 1 |
| Quantidade de entradas | 2 | u32 big-endian = 1 |
| Tamanho da tabela | 6 | u32 big-endian = 20 |
| Flag da tabela | 10 | byte = 1 |
| Nonce | 11 | 8 bytes |
| Tabela | 64 | 20 bytes, criptografados |
| Payload | 128 | patch.wire, 229959 bytes |

Cada item da tabela: u16 BE de tamanho do caminho + caminho UTF-8 + u64 BE do tamanho do conteúdo.
O payload e cada próxima entrada são alinhados a 64 bytes. O nonce recebido é fb5fde6049a70122.
Salsa20/20 é posicionado pelo offset absoluto do arquivo, inclusive para descriptografar a tabela.
O ramo .cwired deriva sua chave pelo XOR do material do runtime com BLAKE2b-256 de sourceeffectmixer.
O ramo .wired usa diretamente o material-base. Não se trata de SHA-512 nem de digest SHA-1 no offset 64.

Referências: bundle-header.c (0x1805e1ed0), bundle-directory.c (0x1805e20f0),
bundle-factory.c (0x180151340), bundle-crypto.c (0x180153600, 0x180c03b70/60),
bundle-cipher.c (0x1805e45b0, 0x1805e4840). scripts/extract_bundle.py e salsa20.py
reproduzem a leitura; o parser valida limites, caminhos relativos, comprimentos e estrutura JSON.

Este contêiner não fornece, no formato observado, autenticação criptográfica do conteúdo.
A integridade da análise foi aferida por hashes SHA-256, estrutura e parsing, não por uma assinatura validada.
Nenhum teste de ativação comercial ou API proprietária de licenciamento foi realizado.
Não se alteraram executáveis, licença, publisher ou UUID do original. A nova implementação tem identidade própria.
