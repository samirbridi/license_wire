# 04 - Criptografia, Certificados mTLS e Segurança

## 1. Mutual TLS (mTLS) no Gateway de Veículos (`br-app-gateway.gwmcloud.com`)
O gateway de telemetria e comandos da GWM exige autenticação mútua TLS na camada de transporte usando certificados embarcados no aplicativo móvel:

- **`binaries/certs/gwm_general.cer`**: Certificado cliente X.509 (`CN=general_cert`, emitido pela CA interna da GWM).
- **`binaries/certs/gwm_general.key`**: Chave privada RSA de 2048 bits correspondente ao certificado cliente.
- **`binaries/certs/gwm_root.cer`**: Certificado raiz da Autoridade Certificadora interna da GWM.
- **Configuração TLS em Node.js**:
  - Como o certificado usa algoritmos legados aceitos pelo balanceador da GWM, a conexão HTTPS em Node.js (OpenSSL 3.x) requer `ciphers: "DEFAULT:@SECLEVEL=0"` e `rejectUnauthorized: false` (ou validação explícita contra `gwm_root.cer`).

## 2. Hashing de Credenciais e PIN
- **Senha da Conta (`password`)**: Enviada no payload de login como hash **MD5 hexadecimal em minúsculas** (`md5(PASSWORD)`).
- **PIN de Segurança (`securityPassword`)**: Exigido apenas para comandos remotos ativos (`T5/sendCmd`), enviado como hash **MD5 hexadecimal em minúsculas** (`md5(PIN)`). Leituras de telemetria (`acquireVehicles`, `getLastStatus`, `getChargeLogs`) **não exigem o PIN**.

## 3. Proteção de Credenciais no Repositório
- Seguindo as diretrizes de segurança do projeto, **nenhuma credencial real (e-mail, senha, PIN, VIN ou tokens JWT)** deve ser gravada em arquivos versionados pelo Git.
- Credenciais e sessões em cache ficam restritas a variáveis de ambiente (`.env` ignorado pelo Git) ou ao diretório privado `runtime/` ignorado pelo `.gitignore`.
