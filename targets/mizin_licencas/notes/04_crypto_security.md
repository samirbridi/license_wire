# Emissão e verificação

O serial tem 128 bits aleatórios. O servidor assina as autorizações com Ed25519. O banco guarda os seriais para reexibição ao titular, a chave privada do emissor e hashes dos segredos de instalação e sessão. As senhas usam scrypt com sal por conta. A autorização offline depende do relógio e da proteção local do segredo da instalação. Clonagem de imagem e retrocesso de relógio deverão ser tratados nos clientes de produção.
