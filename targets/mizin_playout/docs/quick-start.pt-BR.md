# Seu primeiro show

Estado: protótipo de desenvolvimento. O padrão é inglês; Português (Brasil) fica disponível na barra superior.

1. Abra MizinPlayout.exe ou Start Mizin Playout.cmd após compilar.
2. Use **Adicionar arquivos**, **Adicionar pasta** ou arraste arquivos/pastas locais para a janela. A busca nas pastas ocorre em segundo plano. Os originais permanecem no lugar.
3. Clique duas vezes em um item para prepará-lo na **Prévia**, com áudio mudo.
4. Selecione **Programa A** ou **Programa B** como destino.
5. Use **ENVIAR** ou **Ctrl+Enter**. O novo deck precisa fornecer um quadro antes de substituir o programa atual. Este protótipo faz cortes.
6. Em **Saídas**, escolha o programa e a tela. Use **Janela de teste** antes de ocupar um projetor e clique em **Abrir saída**.
7. Escolha o mesmo programa em várias saídas para espelhar o vídeo, ou programas diferentes para conteúdos independentes. O áudio toca uma vez por programa, sem duplicação por espelho.
8. Pressione **Escape** na janela de saída para fechá-la. **Preto no canal selecionado** limpa um programa.
9. Use **Salvar show** para criar um .mizinshow. **Abrir show** restaura referências e ordem de reprodução. Mover mídias pode exigir reconstruir as referências neste protótipo.

A troca de idioma preserva reprodução e nomes de mídia. As preferências oferecem hardware automático ou CPU; reinicie para aplicar. F1 abre a ajuda nativa.

MP4/MKV/AVI/MOV são contêineres. A reprodução depende dos codecs e do backend FFmpeg fixado. Não há conversão obrigatória para formatos de navegador. Mídias incompatíveis/corrompidas geram erro; falha na preparação da próxima mídia preserva o programa atual.

## Limites do desenvolvimento

Esta etapa tem dois programas lógicos e três linhas de roteamento. Dissolve/composição, trim, áudio por dispositivo, autosave/relink, agenda, remoto e qualificação de produção são marcos futuros. Janelas de saída não comprovam sincronismo entre conectores físicos ou genlock. Validar o show na máquina e nas telas reais antes do uso operacional.
