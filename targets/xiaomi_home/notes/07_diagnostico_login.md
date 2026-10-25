# Diagnóstico de autenticação — 2026-10-25

## Evidência do usuário

O usuário confirmou acesso no Android digitando e-mail e senha da conta Xiaomi. O print da tentativa local go2rtc mostra código `70016` e descrição `登录验证失败` (falha na verificação do login), sem captcha nessa resposta.

Nenhuma senha, endereço de e-mail, assinatura de sessão ou resposta bruta do usuário foi copiada para esta nota. As imagens de erro não foram copiadas para evidência pública por conterem dados de conta/contexto de autenticação. Não foram lidos logs ou configuração privada da sessão para investigar esse erro.

## Verificações efetuadas

1. A documentação oficial Xiaomi permite e-mail de recuperação, telefone ou ID Xiaomi como nome de usuário no login com senha. Fonte: `https://account.xiaomi.com/helpcenter/faq/en_US/01.guide/02.login/faq-1`.
2. Código público da versão instalada, v1.9.15, obtido para leitura em `evidence/tools/go2rtc-v1.9.15-source/`, sem execução/modificação:
   - `cloud.go:45`: entrada `Login(username, password string)`.
   - `cloud.go:63-70`: formulário envia o valor de username no campo user; não há imposição de identificador numérico nessa função.
   - `cloud.go:82`: autenticação em `serviceLoginAuth2` do domínio oficial Xiaomi.
   - `cloud.go:111-120`: trata captcha, verificação adicional e resposta sem location; a última retorna o erro recebido.
3. O projeto go2rtc tem relato do mesmo código em `https://github.com/AlexxIT/go2rtc/issues/2416`. Esse relato não determina a causa no caso do usuário.

Conclusão limitada: o erro ocorreu na autenticação da conta, antes de obter vídeo das câmeras. Não prova incompatibilidade de firmware, região errada ou senha incorreta. E-mail como identificador não é, por si só, impedimento.

## Próximo teste pelo proprietário

Entrar na conta existente pelo site oficial `https://account.xiaomi.com/`, neste Windows, com o mesmo e-mail e senha. Concluir eventual validação solicitada pelo site. Informar apenas se o acesso funcionou ou qual tipo de validação foi solicitado; não compartilhar credenciais ou código.

Esse teste verifica o acesso da conta e possíveis solicitações adicionais do site. A sessão do navegador não é transferida automaticamente ao cliente HTTP do go2rtc, portanto login no site não será tratado como correção comprovada da integração.

Se a conta oficial entrar normalmente, uma próxima alternativa limitada é usar o ID numérico da mesma conta no campo Username do go2rtc com a mesma senha, sem criar conta, trocar região ou redefinir senha. Essa alternativa não foi testada e não é garantia de resolução. Evitar repetição automática de tentativas.

## Estado

O usuário informou que só conseguiu entrar no site por Google, com o mesmo ID Xiaomi do Android. Login direto com senha continua sem comprovação nesse ambiente. Foi preparada a alternativa de autorização QR descrita em `notes/08_autorizacao_qr.md`; o proprietário confirma o acesso no Xiaomi Home, sem fornecer senha ao auxiliar.

Estado: QR_XIAOMI_GERADO_AGUARDANDO_CONFIRMACAO_NO_APP. Nenhuma proteção foi desativada e nenhuma alteração de senha/conta/firmware foi realizada.
