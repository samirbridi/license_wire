# Seu primeiro show

Na versão Windows de testes, execute o Setup para instalar na sua conta, ou extraia o ZIP e abra MizinPlayout.exe. Os arquivos do runtime Microsoft Visual C++ acompanham o aplicativo (não é preciso permissão de administrador); o instalador oficial para o computador todo continua em prerequisites/. Se o Setup for bloqueado em algum computador, o ZIP portátil é o mesmo aplicativo. Os runtimes oficiais NDI e OMT acompanham o aplicativo em sua própria pasta. A abertura normal guarda configurações em %LOCALAPPDATA%/Mizin/Mizin Playout. Start portable.cmd (ou --portable) usa state/ ao lado do EXE; --state-dir tem prioridade sobre os dois modos. Reinstalar/desinstalar preserva preferências e mídias. O atalho de desenvolvimento anterior continua válido. Salve o show explicitamente; os vídeos continuam nas pastas originais.

A Live Desk começa com a Prévia (muda até você ligar **Ouvir o Preview**) e um único **PROGRAMA**. **+ Adicionar Program** cria um Program independente com playlist vazia. Selecione o Program na MAIN para editar sua lista e operar CUT/FADE, Manual/Sequencial, Loop e Repetir. Ao adicionar Programs, a MAIN monta um multiview de todos eles ao lado da Prévia. Clique no nome de um Program na grade ou use o menu de destino para selecionar sua playlist e os controles de envio. Selecionar não interrompe a reprodução. Cada quadro tem controles próprios de reproduzir/pausar e Preto. Configurações maiores usam rolagem dentro do multiview.

Aguarde o indicador verde **PRONTO** ao lado da Prévia antes da troca manual. Ele verifica o arquivo selecionado, o recorte aplicado e um quadro de vídeo dentro desse recorte. Um novo In/Out aplicado passa por outra conferência. **Preparando**, **Não preparado** e **Erro** não liberam CUT/FADE. Corrija a origem e carregue o item novamente. Alterar o arquivo invalida PRONTO; outra checagem do arquivo ocorre no envio. O Program ainda prepara seu próprio deck ao receber o envio; PRONTO não promete troca sem atraso. Arquivos somente de áudio usam o estado de preparação/navegação informado pelo backend.

Abra **Configurações → Diagnósticos do motor** ou use a pequena engrenagem no rodapé da MAIN. O painel mostra estados dos canais, quadros publicados, progresso de buffer, tempos de composição CPU e contadores NDI/OMT por Program. **Exportar relatório** salva um JSON local. **Não disponível** indica uma medição não exposta pelo backend; não significa uso zero ou ausência de quadros perdidos. A contagem de publicações não comprova FPS no monitor físico.

**Antes de tudo, ajuste o projeto:** em **Configurações → Reprodução** escolha o **Frame rate do projeto** do evento (29,97 ou 30 fps para a maioria dos vídeos, 25 fps em sistemas PAL, 59,94/60 fps para telão de LED com movimento rápido, 23,976/24 para conteúdo de cinema). NDI, OMT e o monitor web seguem essa taxa; **Automático** segue cada vídeo. Detalhes em *Frame rate do projeto*, mais abaixo.

1. Na **MAIN**, adicione arquivos, uma pasta ou arraste mídias locais para a janela.
2. Dê dois cliques em um item da lista, ou use Carregar selecionado, para preparar o Preview. CUT e FADE ficam disponíveis quando o item selecionado estiver preparado.
3. Escolha **Editar item** ou abra **EDIÇÃO** para preparar In/Out e transições por item. Selecione o item, navegue no Preview e use Marcar In / Marcar Out, ou digite segundos com milissegundos. Out = Fim da mídia usa o restante do arquivo. Aplicar item salva os ajustes sem modificar o original. Restaurar ajustes recarrega os valores aplicados.
4. Volte à MAIN, selecione o Program de destino e pressione **CUT** para uma troca imediata após a preparação, ou **FADE** para um dissolve. A duração começa em **300 ms**, pode variar de 1 a 10000 ms e é lembrada neste computador. CUT / Ctrl+Enter ignora o fade de entrada do item. FADE / Ctrl+Space também faz entrada a partir do preto se o destino estiver vazio. Essas ações manuais preservam os ajustes salvos do item. Os atalhos operam somente na MAIN.
5. Selecione **Manual** para trocas manuais: o vídeo para no Out e mantém o último quadro. Com fade de saída, termina em preto. Selecione **Sequencial** para avançar usando a transição salva de cada próximo item; Repetir lista repete a lista, mesmo com um único item. Cada Program tem seu modo. **Loop** repete somente o recorte atual no modo manual.
6. Em **Saídas → Telas**, escolha o Program e a tela. Reutilizar o Program espelha os mesmos quadros; o áudio toca uma vez por Program. Escape fecha a saída. O rodapé da MAIN mostra medidores de A/do selecionado e contagens gerais de rotas/transmissores; detalhes por Program/rota ficam em Saídas/Áudio/Diagnósticos. Clicar numa rota ou protocolo abre sua configuração, sem ativar a saída. O ícone de áudio abre o roteamento de áudio.
7. Salvar show grava um .mizinshow de esquema 4 com todas as playlists aplicadas, identidades dos Programs e fontes das rotas. Shows antigos de esquema 1/2/3 continuam abrindo; listas compartilhadas viram cópias independentes. Duplicar item reutiliza o arquivo com recortes independentes.

## Programs, cópias e espelhamento

Cada abertura começa com um Program e uma rota. **+ Adicionar Program** cria outro canal independente com lista vazia. Adicione/arraste arquivos ou pastas para esse Program; a Biblioteca compartilhada pode referenciar o mesmo arquivo original em várias listas. Aplique/restaure ajustes do editor antes de trocar de Program. A troca limpa o PRONTO da Prévia: carregue a lista selecionada antes do envio. Os Programs em reprodução continuam.

**Copiar playlist de A** preenche uma lista selecionada vazia com cópias dos itens aplicados de A. Depois, edição e reprodução são independentes. Os itens existentes são preservados; use um Program novo/vazio para uma nova cópia. Para espelhamento ao vivo, use **Saídas → Telas → + Adicionar saída de tela** e escolha A como fonte. O espelho acompanha a reprodução de A sem criar outro decodificador. Escolha outro Program para conteúdo independente.

**Saídas → Telas** lista todos os Programs, inclusive os que estão sem rota de tela. A tabela mostra a quantidade de itens da playlist e os números das rotas configuradas. **+ Adicionar rota** na linha de um Program cria uma rota fechada com esse Program como fonte; escolha a tela/perfil e abra manualmente. Criar um Program adiciona um canal independente de reprodução, sem adicionar uma tela. O botão geral **+ Adicionar saída de tela** usa A para espelhamento. A alteração da fonte de uma rota entra ao reabri-la.

Adicione/remova rotas conforme o evento. Feche a última tela antes de remover a rota. Para remover um Program extra, coloque-o em Preto e feche/pare suas telas e transmissores NDI/OMT; mídia carregada/pausada ou importação em andamento também bloqueiam a remoção. A não pode ser removido. Selecione o Program na MAIN ou na lista de Saídas antes de usar **Remover Program selecionado** em Saídas. Identidades/preferências dos sobreviventes são preservadas; rotas fechadas do Program removido voltam para A.

Salvar show guarda todas as listas aplicadas, IDs dos Programs e fontes das rotas (esquema 4). Shows de esquema 1/2 abrem com um Program; a lista compartilhada do esquema 3 vira cópias independentes em cada Program antigo. Reabrir não inicia telas/transmissores. Três Programs e cinco rotas flutuantes são a prova funcional, não uma capacidade garantida de hardware. Existem proteções de alocação de 64 Programs / 128 rotas; a quantidade utilizável depende da máquina/mídias e deve ser medida para o evento.

## Operação ao vivo

Cada CUT ou FADE manual inicia uma cópia da lista atual naquele Program. Alterações do editor entram no próximo disparo, após Aplicar item. Campos não aplicados não são enviados ao Program por CUT/FADE nem salvos no show; aplique antes de selecionar outro item. Alternar MAIN/EDIÇÃO ou preparar o Preview não interrompe os Programs. O modo sequencial prepara o próximo item; se ele não estiver pronto, aguarda no limite. Uma falha é informada e interrompe o avanço. Em recortes curtos, fades são limitados à metade do trecho. Um próximo item preparado substitui o fade de saída do item atual na sequência.

## Decks em janela própria e NO AR

O ícone de destacar no canto de cada deck (Prévia, Program e cada Program da multiview) abre aquele deck numa janela própria, que pode ir para outro monitor e ser redimensionada. **F11** ou o botão de tela cheia alterna tela cheia; **Esc** sai da tela cheia. Fechar a janela (ou clicar em "Em janela separada · clique para encaixar" no deck) encaixa o deck de volta. A janela usa os mesmos quadros do Program, sem abrir a mídia de novo, e seus botões agem só naquele Program. Ela é um monitor do operador, não uma saída: para telão/LED use Saídas. A posição fica lembrada; se aquele monitor estiver com uma saída aberta, a janela abre no monitor da mesa.

Um Program com mídia no ar (tocando ou pausado) recebe a barra vermelha e o selo **NO AR**; em preto/vazio, não. A borda azul continua indicando o destino do TAKE.

## Monitor web (assistir pelo navegador)

Em **Saídas → Monitor web**, escolha **Rede local (LAN)** ou **Somente este computador**, a porta (padrão 8787) e clique em **Iniciar monitor web**. Aparecem os endereços com o código de acesso (ex.: `http://192.168.1.30:8787/?k=código`): abra num celular, tablet ou outro computador da mesma rede. A página lista os Programs com o selo **NO AR**; **Assistir** abre o Program ao vivo (1280×720, até 30 fps, áudio estéreo). O áudio começa mudo por regra do navegador: toque em **Som**. É só visualização — nada no navegador controla o playout.

O monitor web nunca liga sozinho ao abrir o aplicativo. **Novo código** troca o código e desconecta todos. Cada Program assistido usa um único codificador H.264 do Windows, compartilhado por todos que o assistem. Na primeira vez o Windows pode pedir para liberar a rede; o vídeo usa as portas UDP 50200–50399. Não exponha a porta na internet.

**Qualidade**: **Automática** segue a origem de cada Program (1080p continua 1080p, 4K é reduzido para 1080p, origens menores mantêm o tamanho); **720p**, **1080p** e **4K** são fixas. A troca vale na hora. O codificador da placa de vídeo (NVIDIA, Intel, AMD) é usado quando disponível; o 4K precisa dele e de rede cabeada (cerca de 25 Mbit/s por Program assistido).

Na página, cada pessoa também pode escolher a **qualidade** ao lado do botão Som (Padrão do app, Auto até 1080p, 720p, 1080p ou 4K); a escolha fica salva naquele navegador e quem escolhe a mesma qualidade compartilha um codificador.

## Saída de áudio de baixa latência

Em **Áudio → Saída de baixa latência**, escolha o motor e o dispositivo e clique em **Iniciar saída de baixa latência**. **WASAPI exclusivo** fala direto com o driver (menor atraso; o dispositivo fica reservado para o Mizin). **WASAPI compartilhado de baixa latência** deixa outros aplicativos usarem o mesmo dispositivo. **ASIO** (Dante Virtual Soundcard, Behringer UMC, Blackmagic) só aparece na versão com a licença Steinberg. Em **Buffer**, "Mínimo do dispositivo" é o menor atraso; aumente se ouvir estalos.

Escolha o par de saídas de cada Program (ex.: A em 1–2, B em 3–4) — útil em interfaces com muitas saídas, como Dante. Volume, mudo e Monitoramento local de cada Program continuam valendo. **Sincronizar com o vídeo automaticamente** mede o atraso com que o vídeo é publicado e atrasa o áudio só o necessário; use **Ajuste fino** (ms) para compensar projetor/processador de LED. Se o dispositivo falhar ou for desconectado, os Programs voltam sozinhos para a saída normal. As saídas NDI, OMT e o monitor web não mudam.

### Áudio em rede AES67 (compatível com Dante)

Em **Áudio → Saída de baixa latência** escolha o motor **Rede AES67 (compatível com Dante)** e a placa de rede. Defina o **nome do fluxo**, quantos **canais** (até 64; cada 8 canais formam um fluxo multicast), o **endereço multicast** (automático 239.69.x.y) e a **latência do receptor** (use a mesma nos receptores). Cada Program vai para o seu par de canais, como numa interface.

O fluxo é anunciado na rede (SAP), então aparece no **Dante Controller** como fluxo AES67 e em outros receptores AES67. Nos equipamentos Dante, ative o **modo AES67** pelo Dante Controller. O relógio é PTPv2: o playout segue o grandmaster da rede (um equipamento Dante em AES67 assume esse papel) e, se não houver nenhum, ele mesmo vira grandmaster. A linha de status mostra o estado do PTP. Use rede cabeada; em redes gerenciadas, libere multicast/IGMP e priorize o tráfego PTP e de áudio.

O Dante nativo (sem placa virtual, com o playout aparecendo como equipamento Dante) aguarda a licença da Audinate.

### Ouvir o Preview (PFL)

Ligue **Ouvir o Preview** (botão de fone no deck PREVIEW ou o painel PREVIEW na página **Áudio**) e escolha o dispositivo — normalmente o fone ou uma caixa de retorno — para ouvir o item antes de disparar. O som do Preview nunca vai para os Programs, NDI/OMT, AES67 ou monitor web.

### Frame rate do projeto

Em **Configurações → Reprodução**, o **Frame rate do projeto** funciona como a taxa de uma composição: com uma taxa fixa (23,976, 24, 25, 29,97, 30, 50, 59,94 ou 60), NDI, OMT e o monitor web entregam uma cadência constante, repetindo ou pulando quadros de vídeos com outra taxa (o monitor web usa a metade de 50/59,94/60). **Automático** segue cada vídeo. A sincronia de áudio e vídeo nunca depende disso — cada Program tem seu próprio relógio; as saídas de tela seguem a atualização do monitor. Uma taxa fixa também reduz o trabalho por quadro das saídas digitais.

## Salvamento automático, recuperação e mídias ausentes

Enquanto houver alterações não salvas, o Mizin Playout grava uma cópia automática do show a cada poucos segundos na pasta de configurações. Se o aplicativo fechar sem salvar (queda, falta de energia), na próxima abertura ele pergunta se você quer restaurar essa cópia; o show volta marcado como não salvo para você salvar. Uma cópia descartada é guardada em `recovery/` (as 5 mais recentes), nunca apagada sem aviso. Ao salvar por cima de um show, a versão anterior fica ao lado como `.mizinshow.bak`.

Se um show for aberto em outro computador ou com o HD em outra letra, o aplicativo avisa quantas mídias não foram encontradas e pede a pasta onde elas estão. Ele procura pelos nomes dos arquivos, inclusive em subpastas; quando há arquivos com o mesmo nome, escolhe o que está na pasta mais parecida e deixa de fora os casos ambíguos. Também dá para fazer isso em **Biblioteca → Localizar mídias ausentes**. Os Programs no ar não são alterados; a mudança vale nos próximos disparos e marca o show para salvar.

## Pacote portátil do show

**Exportar pacote do show** (no topo, ao lado de Salvar show) cria uma pasta com o arquivo do show e a subpasta `media/` com todas as mídias usadas por todos os Programs. Os caminhos ficam relativos à pasta do show: copie a pasta inteira para outro computador, HD ou pendrive e abra o `.mizinshow` de lá. Arquivos com o mesmo nome vindos de pastas diferentes recebem "(2)", "(3)"… O aplicativo confere o espaço livre antes, mostra o progresso com Cancelar e confere o tamanho de cada cópia; mídias ausentes ficam de fora e são listadas no fim. Ao salvar um show cujas mídias estão dentro da pasta dele, os caminhos continuam relativos.

## Mizin Link: várias máquinas na rede

Em **Saídas → Mizin Link**, escolha a função de cada computador: **Mestre** (envia o show) ou **Seguidor** (recebe). Use o mesmo **código do Link** em todas as máquinas (o botão Novo código gera um) e clique em **Iniciar Link**. Os seguidores encontram o mestre sozinhos na rede (ou digite o endereço dele). A tabela mostra cada máquina, a diferença de relógio medida e quantas mídias ela já tem.

No mestre, **Enviar show para as máquinas** manda o show atual e todas as mídias; cada arquivo é conferido por SHA-256 e, num reenvio, só o que mudou ou faltou é baixado. No seguidor, **Carregar show recebido** abre o show com as mídias copiadas. Mensagens sem o código certo são recusadas. Esta é a fase 1; o espelhamento de reserva (o reserva repete o principal e pode assumir) e a reprodução sincronizada entre PCs vêm nas próximas versões.

### Principal + reserva (espelhamento)

Na máquina reserva (Seguidor), depois de **Carregar show recebido**, marque **Espelhar o mestre (reserva)**. A partir daí ela repete cada CUT e FADE, pausa, preto e loop do principal e acompanha a posição de cada Program, corrigindo se o desvio passar de 80 ms. A linha de status mostra o erro de posição e quantas correções foram feitas. Abra as saídas da reserva normalmente; elas não abrem sozinhas.

Se o principal cair ou parar de responder por 1,5 s, aparece a faixa vermelha **MESTRE PERDIDO**: a reserva continua tocando sozinha, você passa as telas para ela (no seu switcher/matriz) e, se quiser, clica em **Assumir como mestre** para ela passar a comandar as outras máquinas.

### Vários PCs tocando juntos (telão dividido)

No mestre, marque **Disparo sincronizado**. A partir daí, cada CUT e FADE é preparado em todas as máquinas e disparado no mesmo instante (o disparo espera 0,4 s). Nos seguidores, marque **Espelhar o mestre** como na reserva: eles acompanham a posição ajustando levemente a velocidade (até 5%), sem saltos; só pulam se o desvio passar de 250 ms. A tabela de máquinas do mestre mostra o desvio de cada seguidor.

Para dividir um telão entre saídas ou PCs, em **Saídas → Telas** escolha a **ÁREA** de cada saída: metades, terços, quartos ou **Área personalizada** (X, Y, largura e altura em % do vídeo). Cada tela mostra só o seu pedaço, esticado para preencher a tela.

### Controle remoto (estação de controle)

No mestre, em **Operadores remotos**, clique em **Adicionar operador**: defina o nome, o PIN, a permissão (**Operador** controla, **Observador** só assiste) e quais Programs ele pode comandar (**Todos os Programs** ou só alguns). Na outra máquina escolha a função **Estação de controle (remota)**, use o mesmo código do Link, digite o nome de operador e o PIN e clique em **Iniciar Link**. Aparece a **Mesa remota** com cada Program, o que está no ar e a playlist: selecione um item e use CUT, FADE, PRETO ou PAUSA.

A máquina de playout continua no comando: ela confere cada comando, executa como se fosse local (inclusive em disparo sincronizado) e registra tudo em `link/remote-log.txt`. O PIN nunca trafega pela rede; trocar o PIN ou remover o operador desconecta a estação na hora.

## Idioma e desempenho

Inglês é o padrão; Português (Brasil) pode ser escolhido durante a reprodução. As opções de decodificação automática por hardware e por CPU ficam em Configurações e exigem reinício. O suporte depende de codec, perfil e driver. Cortes encaminham quadros nativos compartilhados; transições convertem e compõem em CPU uma vez por Program. Composição em GPU, controle remoto, agendamento e validação de desempenho/sincronismo para produção seguem como próximas etapas. Pranchetas demonstram a interface, não reprodução em saídas físicas.

## Resolução e redimensionamento das saídas

As telas abrem em fullscreen no modo atual do sistema; o aplicativo não muda a resolução do desktop. O vídeo é ajustado sem distorção nem corte, com barras pretas se as proporções forem diferentes. Uma fonte 4K em tela 1080p é reduzida; 1080p em tela 4K é ampliado. A ampliação não recupera detalhes ausentes no original.

Cada rota oferece três perfis:

- **Native · desempenho** — padrão e recomendado para uso ao vivo. Encaminha quadros nativos diretamente à superfície de saída Qt.
- **Lanczos · GPU (SDR)** — redimensionamento Lanczos-3 opcional em GPU OpenGL. Esta primeira implementação compartilha a leitura do quadro por Program e depois filtra/apresenta texturas na GPU. Teste com as mídias e a quantidade real de saídas antes do show.
- **Lanczos · experimental (CPU)** — scaler de referência em CPU. As medições atuais de 4K excedem o orçamento de 30 fps.

Em Saídas, escolha fonte, tela e perfil; depois clique em Abrir saída. Reabra a rota para aplicar alterações. Escape fecha somente aquela saída; os Programs continuam. Telas conectadas/desconectadas são atualizadas automaticamente.

O caminho GPU atual atende SDR de 8 bits, dentro dos limites de tamanho e redução. Quadros de alta profundidade/HDR/transformados/com legendas usam Native; falhas de contexto ou recursos gráficos também retornam ao Native com aviso. Uma máquina sem decodificação por hardware compatível pode decodificar na CPU. Decodificação em CPU e escala na GPU são configurações independentes. Mídias compatíveis não exigem conversão prévia e os originais nunca são regravados.

Lanczos faz reamostragem espacial, sem reconstrução por IA. Ele não recupera detalhes ausentes. O caminho GPU atual ainda lê quadros de hardware antes do envio da textura; não é zero-copy. Veja o [escopo medido](compatibility-and-performance.md) para a GPU testada, os framebuffers reais e os limites de desempenho/sincronismo ainda abertos.

## Áudio dos Programs

Na aba **Áudio**, configure separadamente os Programs ativos. **Volume geral** e **Silenciar** afetam o som local e o enviado pela rede. **Monitoramento local** liga/desliga somente a escuta na máquina. Escolha **Dispositivo de áudio** para direcionar o som a HDMI, placa de áudio, USB ou dispositivo virtual disponível no sistema. A opção Padrão do sistema acompanha o dispositivo padrão do Windows. Se um dispositivo selecionado desaparecer, a saída local é silenciada até ele voltar ou você escolher outro; o áudio de rede continua independente.

Os medidores L/R mostram o pico do mix do Program em dBFS. O Preview só toca som com **Ouvir o Preview** ligado, num dispositivo próprio, e espelhar vídeo em várias telas não multiplica o som local. As preferências de áudio ficam neste computador, separadas do arquivo do show.

## Saídas digitais NDI e OMT

1. Abra **Saídas → NDI / OMT** e escolha o painel do Program principal, ou B depois de habilitá-lo.
2. Defina um **Nome da fonte** que identifique essa saída no receptor.
3. Marque **Incluir áudio** para enviar o mix estéreo de 48 kHz junto ao vídeo SDR. Desmarque para enviar somente vídeo. Essa opção vale para os dois protocolos daquele Program.
4. Clique em **Iniciar NDI** ou **Iniciar OMT**. Os dois podem funcionar ao mesmo tempo e as telas locais continuam independentes. O painel mostra o nome publicado e os contadores de conexão/vídeo/áudio.
5. No receptor compatível, selecione a fonte publicada. Clique em Parar para encerrar aquele protocolo sem parar o Program.

O vídeo acompanha tamanho e cadência da fonte. Preto mantém a última resolução/cadência da transmissão. Sem mídia inicial, a fonte publica preto em 1280×720/30. As transmissões nunca iniciam automaticamente ao abrir o aplicativo ou uma prancheta de demonstração. Ao fechar o aplicativo, os emissores são encerrados.

O runtime oficial NDI acompanha o aplicativo; não é necessária instalação separada. Os termos e avisos do fornecedor estão em licenses/ndi. OMT usa as bibliotecas nativas incluídas neste pacote de desenvolvimento. O caminho atual de rede é SDR de 8 bits com áudio estéreo; não oferece HX, HDR, ASIO exclusivo, mapa multicanal ou ajuste manual de atraso. Valide recepção em outro computador e sincronismo AV com os arquivos e a rede reais antes de um evento. Veja [escopo e evidências](compatibility-and-performance.md).

[Sobre NDI®](https://ndi.video/) · NDI® is a registered trademark of Vizrt NDI AB.




## Controles simplificados e rodapé de desempenho

Na MAIN, **Adicionar mídia** reúne as opções de importar arquivos/pasta. O ícone **+** ao lado do destino adiciona um Programa independente. As setas movem o item selecionado; **Mais** reúne Duplicar item e Remover item. Carregar, Editar e Copiar playlist de A continuam diretamente acessíveis. Manual/Sequencial mantêm tamanho de texto estável nos dois estados.

O rodapé permanente mostra CPU normalizada do processo, RAM residente (MB/GB) e o motor GPU Windows mais ocupado observado para este aplicativo, quando disponível. FPS conta quadros publicados pelo Programa selecionado no último segundo; não mede a tela física. Composição é o tempo da última composição de transição em CPU, não a latência total de renderização. Passe o mouse para ver escopo/versão. Contadores ausentes/desatualizados mostram um traço. A coleta roda em segundo plano aproximadamente uma vez por segundo. O JSON dos Diagnósticos inclui process_usage; isso não identifica qual GPU decodifica o vídeo.


RAM e memória de GPU usam MB/GB decimais, com troca automática para GB em 1000 MB. GPU mostra separadamente atividade em % e memória gráfica usada pelo aplicativo. A memória vem do uso DXGI nos adaptadores consultados (LOCAL + NON_LOCAL, nó 0); não é a capacidade instalada de VRAM. Leituras ausentes/parciais mostram um traço. **Composição**, antes Mix, mede o trabalho de CPU para combinar um quadro de transição; a duração de fade de 300 ms é outro ajuste. O tooltip e o JSON dos Diagnósticos mostram o escopo e as leituras por adaptador.

## Atualizações opcionais

O aplicativo empacotado verifica atualizações oito segundos após abrir. Use **Ver atualização** para ler as novidades em inglês ou português, **Baixar atualização** para obter o arquivo e **Instalar e reiniciar** quando estiver pronto. **Mais tarde** fecha o aviso. Configurações → Atualizações também oferece **Verificar agora**. Nada é baixado ou instalado sem sua escolha. Os downloads são verificados por assinatura dos metadados e hash. Pare os Programs, feche as saídas de tela/NDI/OMT, aplique/descarte edições e salve o projeto antes de instalar. O atualizador preserva seu perfil e reabre o projeto salvo com as saídas fechadas. A pasta portátil é atualizada no local, sem registrar aplicativo instalado. O build 0035 precisa de uma instalação manual para receber o atualizador.

Os diagnósticos NDI verificam sequência, hash do conteúdo e ordem estrita dos timestamps de entrega do SDK. Ao conectar, o SDK pode repetir um quadro idêntico do cache; isso é registrado separadamente. Veja o diagnóstico e as evidências em ISSUE-001. Sincronismo físico AV e recepção em outro computador da rede continuam como validações separadas.
