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

As edições DLL e Wire de um mesmo produto podem apontar para o mesmo direito comercial. Os builds de distribuição devem ter identificadores próprios. O gerenciador Wire e a lógica de marca-d'água serão tratados na integração.
