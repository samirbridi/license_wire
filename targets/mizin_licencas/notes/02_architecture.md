# Arquitetura

O servidor Node atende a interface e a API na mesma origem. SQLite mantém contas, pedidos, direitos por produto e instalações. A transação de pagamento emite uma licença ou altera uma existente. A transação de ativação reserva uma vaga e assina uma autorização válida por 30 dias. Máquinas adicionais em um pacote compartilham os mesmos direitos por produto.
