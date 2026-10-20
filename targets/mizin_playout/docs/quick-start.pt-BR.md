# Seu primeiro show

1. Na **MAIN**, adicione arquivos, uma pasta ou arraste mídias locais para a janela.
2. Dê dois cliques em um item da lista, ou use Carregar selecionado, para preparar o Preview sem áudio. CUT e FADE ficam disponíveis quando o item selecionado estiver preparado.
3. Escolha **Editar item** ou abra **EDIÇÃO** para preparar In/Out e transições por item. Selecione o item, navegue no Preview e use Marcar In / Marcar Out, ou digite segundos com milissegundos. Out = Fim da mídia usa o restante do arquivo. Aplicar item salva os ajustes sem modificar o original. Restaurar ajustes recarrega os valores aplicados.
4. Volte à MAIN, escolha Program A ou B e pressione **CUT** para uma troca imediata após a preparação, ou **FADE** para um dissolve. A duração começa em **300 ms**, pode variar de 1 a 10000 ms e é lembrada neste computador. CUT / Ctrl+Enter ignora o fade de entrada do item. FADE / Ctrl+Space também faz entrada a partir do preto se o destino estiver vazio. Essas ações manuais preservam os ajustes salvos do item. Os atalhos operam somente na MAIN.
5. Deixe Sequencial desmarcado para trocas manuais: o vídeo para no Out e mantém o último quadro. Com fade de saída, termina em preto. Ative Sequencial para avançar usando a transição salva de cada próximo item; Repetir lista repete a lista, mesmo com um único item. Cada Program tem seu modo. Repetir canal selecionado repete somente o recorte atual no modo manual.
6. Em Saídas, escolha o Program e a tela. Reutilizar o Program espelha os mesmos quadros; o áudio toca uma vez por Program. Escape fecha a saída.
7. Salvar show grava um .mizinshow de esquema 2 com os ajustes aplicados. Shows antigos de esquema 1 continuam abrindo. Duplicar item reutiliza o arquivo com recortes independentes.

## Operação ao vivo

Cada CUT ou FADE manual inicia uma cópia da lista atual naquele Program. Alterações do editor entram no próximo disparo, após Aplicar item. Campos não aplicados não são enviados ao Program por CUT/FADE nem salvos no show; aplique antes de selecionar outro item. Alternar MAIN/EDIÇÃO ou preparar o Preview sem áudio não interrompe os Programs. O modo sequencial prepara o próximo item; se ele não estiver pronto, aguarda no limite. Uma falha é informada e interrompe o avanço. Em recortes curtos, fades são limitados à metade do trecho. Um próximo item preparado substitui o fade de saída do item atual na sequência.

## Idioma e desempenho

Inglês é o padrão; Português (Brasil) pode ser escolhido durante a reprodução. As opções de decodificação automática por hardware e por CPU ficam em Configurações e exigem reinício. O suporte depende de codec, perfil e driver. Cortes encaminham quadros nativos compartilhados; transições convertem e compõem em CPU uma vez por Program. Composição em GPU, controle remoto, agendamento e validação de desempenho/sincronismo para produção seguem como próximas etapas. Pranchetas demonstram a interface, não reprodução em saídas físicas.
