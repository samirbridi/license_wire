# Versão identificada nas fotos do proprietário — 2026-10-28

## Estado Atual e Próximos Passos

**A central exibe Coffee OS 3.3.00213.** A versão foi confirmada visualmente em duas fotos originais do proprietário, sem inferência a partir do serviço AirTunes. O caminho visível é **Sistema → Sobre**. Esta evidência completa a identificação da versão que faltava na etapa LAN.

O acesso obtido anteriormente continua limitado à rede e ao serviço AirTunes na porta 7000. Fotografias de menus não demonstram extração de firmware, acesso administrativo ou disponibilidade de ADB. Não houve nova consulta à rede do veículo nesta etapa.

Próximo caminho de análise: obter legitimamente um pacote de atualização ou um APK da central, ou identificar uma interface de diagnóstico documentada para este modelo/build. Nenhum pacote foi fornecido. O botão de manutenção descrito abaixo não será usado como tentativa de abrir depuração.

## Evidências recebidas e limite de preservação

As quatro fotos foram visualizadas após o proprietário restaurar os arquivos em Downloads. As falhas anteriores de arquivo inexistente não eram falhas da central. O visualizador apresentou as quatro imagens e os arquivos foram listados pelo shell. Porém, na tentativa posterior de preservar cópias integrais, o primeiro arquivo já não foi encontrado; a repetição fora da restrição do sandbox também retornou arquivo inexistente. A causa dessa indisponibilidade não foi identificada. **Nenhuma cópia ou hash dos originais foi obtido nesta etapa.** O agente não removeu, moveu ou editou os arquivos de Downloads. A identificação abaixo é uma transcrição da inspeção visual bem-sucedida, com esse limite de proveniência.

- `20261028_000633.jpg`: Sistema → Sobre, **Coffee OS 3.3.00213**, botão **Atualização OTA USB**, nome editável do dispositivo e opções de suporte/reinício de rede.
- `20261028_000649.jpg`: mesma versão; diálogo **Não foram detetados pacotes de atualização disponíveis, confirme**, código **851**. Ao fundo, **Diagnóstico e reparo**, ícone ⓘ e botão **Ligar**.
- `20261028_000919.jpg`: **GWM App Store → Informações do sistema**, versão própria da loja, opções de aceleração/limpeza e acordos. A versão da loja não é a versão do Coffee OS. A transcrição aparente `1.8.25.12.11_6` é provisória devido ao desfoque e não será usada para escolher pacotes.
- `20261028_000931.jpg`: acordo de terceiros da GWM App Store com referências a licenças Apache. Não identifica por si só a versão Android nem o hardware da central.

O nome editável parece `GWM_BC03`, mas essa leitura é provisória e não é tratada como código de hardware. A versão Coffee OS, ao contrário, está claramente legível nas duas primeiras fotos.

Recibo estruturado: [`../evidence/photo-ui-identification-20261028.json`](../evidence/photo-ui-identification-20261028.json). Caso os arquivos originais voltem a ficar disponíveis, sua preservação e os hashes continuam pendentes. Não confundir o recibo da transcrição com evidência fotográfica arquivada.

## Interpretação da mensagem 851

A tela registra que a verificação não encontrou um pacote disponível naquele procedimento. Não foi estabelecido o significado específico do código 851, nem se havia uma mídia USB conectada. A imagem não comprova que a central esteja na versão mais recente disponibilizada pela GWM. Não foi iniciado nenhum processo de atualização pelo agente.

## Diagnóstico e reparo

O proprietário tocou no ícone de informações e relatou: **Não aparece nada**. Nenhuma ativação do botão **Ligar** foi solicitada, executada pelo agente ou confirmada pelo proprietário.

Foi encontrada uma referência primária relevante em **outro modelo**, no [manual oficial GWM Wey 07](https://www.gwmmotors.com.br/content/dam/gwm/pages/br/pt/models/wey/manual-do-proprietario/manual-do-proprietario-wey-07.pdf), página impressa 266. O manual descreve o mesmo caminho Sistema → Sobre → Diagnóstico e Reparo como modo de manutenção do veículo que afeta a conexão do sistema de alta tensão e impede condução/recarga enquanto ativo.

**Limite de aplicação:** esse documento é do Wey 07; não confirma o comportamento no ORA 5. É suficiente para rejeitar a suposição de que o botão seja uma opção de depuração Android. A opção permanece sem acionamento no escopo desta investigação.

## REA/Ghidra

Nesta etapa houve identificação visual e registro da transcrição. Não houve binário da central, novo firmware/APK, análise REA/Ghidra ou alteração veicular. As fotos permitem orientar uma análise futura para o build correto, sem estabelecer a disponibilidade de um método de desbloqueio.
