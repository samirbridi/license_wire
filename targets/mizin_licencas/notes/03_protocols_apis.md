# API de licenciamento

Todas as chamadas POST usam JSON. A aplicação cliente gera 32 bytes aleatórios no primeiro uso, guarda o segredo no armazenamento protegido do sistema e o representa com 64 caracteres hexadecimais minúsculos em `installationKey`. Apps do mesmo pacote precisam compartilhar essa identidade na máquina para consumir a mesma vaga.

| Operação | Requisição | Resultado |
| --- | --- | --- |
| Ativar | POST `/api/activate` com `serial`, `product`, `release`, `installationKey`, `label` | Reserva ou reutiliza a vaga e retorna `token`. |
| Revalidar | POST `/api/verify` com os mesmos campos, dispensando `label` | Renova o token se a máquina estiver ativa e o build for elegível. |
| Consultar chave | GET `/api/public-key` | Chave Ed25519 pública em PEM para provisionamento. |
| Liberar vaga | POST `/api/release-machine` com sessão do titular, `serial` e `device` listado na conta | Desvincula a instalação. |

O token usa duas partes separadas por ponto. A primeira contém JSON em base64url. A segunda é a assinatura Ed25519, também em base64url, do texto ASCII da primeira parte. O consumidor verifica a chave pública fixada na distribuição, versão do formato, produto, build, hash SHA-256 do texto de identidade e janela temporal em milissegundos UTC. Consulte `verifyOffline` e seus testes.

Ativação explícita e revalidação periódica usam rotas distintas. Uma máquina remotamente liberada recebe 403 ao revalidar. A autorização em cache pode continuar funcionando até expirar. Um erro de rede permite usar a autorização local ainda válida. Uma recusa explícita do servidor deve atualizar o estado do cliente. O processamento de vídeo e áudio deve continuar independente da chamada de rede.

As edições DLL e Wire de um mesmo produto compartilham o direito comercial. A edição Wire usa um build identificado em `wireReleases`. O app faz login por `POST /api/login` e usa a sessão para consultar `GET /api/wire/library`. As operações `POST /api/wire/activate`, `/api/wire/verify` e `/api/wire/download` recebem `licenseId`, `product`, `release` e `installationKey`, com `label` na ativação. O servidor consulta o titular e a elegibilidade em cada operação. O download requer vaga ativa. A chave pública da edição Windows vem de `GET /api/wire/issuer` no empacotamento. A resposta assinada usa P-256/SHA-256 em formato P1363 sobre o texto ASCII de `payload`. Tanto o payload JSON quanto a assinatura usam base64.
