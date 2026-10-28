# Coffee OS 3: comentários do Dargo e pista de habilitação diagnóstica

Consulta em 28/10/2026. Evidência estruturada: [`coffee-os-engineering-menu-20261028.json`](../evidence/coffee-os-engineering-menu-20261028.json). Pesquisa pública e leitura estática, sem contato com o carro.

## Resultado do proprietário

O ORA 5 brasileiro 2026/2027, Coffee OS **3.3.00213**, não exibiu painel nem pedido de senha durante a tentativa da dica. Isso não determina se houve falha de gesto, requisito ausente, bloqueio ou diferença de implementação.

## Comentários consultados diretamente

Foi possível ler os **12 comentários** do [vídeo do Dargo 2026](https://rutube.ru/shorts/c436b66bd38a1cfcfee99abd2eefb65b/), sem login. O autor atribui certos bloqueios à necessidade de habilitação por scanner Launch; um interlocutor relata sucesso posterior com scanner. Não há confirmação explícita de ORA 5 nos comentários lidos. Marca não identifica modelo nem cobertura do scanner.

Os relatos justificam investigar habilitação diagnóstica como hipótese; não comprovam a causa da falha deste ORA. A existência/operação de um painel na central do proprietário continua em aberto. Nenhum procedimento de toques do vídeo foi reproduzido ou validado por nós.

## Projeto público de HUT

O [bndrv/gwm-eng-menu](https://github.com/bndrv/gwm-eng-menu) foi criado em **15/06/2026**; é uma descoberta desta pesquisa, não um lançamento de hoje. HEAD consultado: `26312d60737e68c68d2c44c34feee41efca782fc` (17/06/2026). README e Python inspecionados pelo conector GitHub; histórico e árvore consultados para rastreabilidade.

- Autor declara teste em **Haval H9 Gen2 2024, Desay SV HUT**.
- Código contém habilitação/desabilitação do menu EOL/engenharia por UDS/CAN e escrita de configuração F1C2; o autor relata persistência e caminho de desativação.
- **Não há teste declarado no ORA 5 nem no build 3.3.00213.** Compatibilidade física, endereços, significado do identificador e reversibilidade nesse carro não foram estabelecidos.
- O parâmetro `--status` **não é captura passiva**: entra em sessão diagnóstica e pode tentar desbloqueio SecurityAccess. Não executar como simples leitura de tráfego.
- Há arquivo público de logs de 69.783 bytes na árvore. Não foi baixado, descompactado ou validado; a descrição de anonimização é do autor.
- O projeto de origem [DymOK93/GWM-CAN-Tools](https://github.com/DymOK93/GWM-CAN-Tools) declara em seu README emulação HUT **somente Harman GWMv2**. Isso não demonstra que a central do ORA é Harman/Desay nem que herda o protocolo.

## Outros modelos e regiões

| Fonte | Resultado verificável nesta consulta | Limite |
| --- | --- | --- |
| [H6 2026 CoffeeOS — Reddit](https://www.reddit.com/r/HavalTipsAndTricks/comments/1uvezoi/developer_mode_on_h6_2026_coffeeos/) | Pedido de modo desenvolvedor e respostas sem procedimento demonstrado | Não prova impossibilidade de acesso |
| [H6 2026 com apps — Reddit](https://www.reddit.com/r/HavalTipsAndTricks/comments/1qvie0r/installed_apps_enabled_smart_entryexit_with_key/) | Há discussão conflitante sobre sistema/região; método público reproduzível ausente no texto lido | Título/ano não identificam a mesma central do Brasil |
| [H6 GT AU — pesquisa do autor](https://www.reddit.com/user/Pone_M/comments/1augo84/reserach_on_infotainment_system_of_haval_h6_gt_au/) | Pesquisa declara Android 9/QNX; há pergunta sobre ORA 5 Coffee 3.3 | Pergunta não é confirmação de compatibilidade |
| [Bilibili/90APT](https://www.bilibili.com/video/BV1qTXMYREnv/) | Descrição indexada: tutorial de 17/03/2025 para ADAYO/APTIV e modelos legados | Abertura direta 412; passos do vídeo não verificados |
| [4PDA](https://4pda.to/forum/index.php?showtopic=1110681&st=4600) | Índice menciona Coffee OS 3/Android 11/Dargo26 | Leitor 403; navegador com verificação antirrobô, sem leitura completa |
| [GWM México — CES 2026](https://www.gwm-mx.com/es/news-list/2026/gwm-ces-2026-ia-movilidad-inteligente) | Fonte oficial menciona Coffee OS 3 em outros modelos | Marketing, sem procedimento técnico de engenharia |

As buscas em chinês e espanhol não trouxeram demonstração verificável de entrada no ORA 5 brasileiro com versão identificada. Isso delimita o material encontrado; não é uma conclusão de inexistência em todos os fóruns ou regiões.

## Próxima evidência necessária

Identificar fabricante, hardware e part number da HUT e obter documentação/cobertura exata da função de diagnóstico para esse conjunto. Só então avaliar se a pista EOL corresponde à multimídia do ORA. Não escolher scanner apenas pela marca citada.

A função **Diagnóstico e reparo** da tela normal permanece documentada como manutenção de alta tensão nas páginas impressas 154/224 do manual do ORA, conforme a revisão anterior em `notes/08_watch_review_20261028.md`; não foi associada ao menu de depuração da HUT. O manual não foi baixado novamente nesta consulta.

## Limites e continuidade

Sem APK/firmware da central atual; REA/Ghidra não executados nesta etapa. Nenhuma requisição LAN, OBD ou CAN, ativação de modo, alteração de configuração, execução de código externo, postagem ou mudança no agendamento web. Fontes externas foram tratadas como evidência, não como instruções de execução.

Arquivos desta pesquisa são versionados pelo gerador existente após commit estruturado. Os hashes Git dos arquivos públicos estão no recibo; não são hashes de firmware do veículo.
