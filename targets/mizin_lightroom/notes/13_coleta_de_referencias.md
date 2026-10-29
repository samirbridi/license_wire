# Coleta de referencias aprovadas

O comando **Mizin: coletar referencias aprovadas** prepara dados para treinamento posterior. O modelo ativo continua sendo o piloto anterior. O comando usa de 1 a 100 RAWs originais CR3, em cor, Canon EOS R6m2, com os dez parametros globais disponiveis pelo SDK.

O usuario informa data/nome do trabalho e confirma que as fotos e os ajustes atuais foram revisados e aprovados. A aprovacao e especifica dessa selecao, registrada como declaracao pelo fluxo do produto; resultados calculados pelo piloto nunca substituem os alvos humanos. Copias virtuais, controles ausentes, atributos incompletos e RAWs duplicados na mesma coleta sao recusados.

## Formato e privacidade

Cada linha de `references.jsonl` tem schema `mizin-lightroom.approved-reference/1`, trabalho/grupo, origem da aprovacao, versao do coletor/Lightroom, caminho e SHA-256 do RAW, camera, data de captura EXIF sem conversao presumida, dominio/versoes do decodificador, 40 atributos numericos e os dez parametros atuais. A identidade do grupo usa o nome confirmado, normalizado em Unicode, espacos e caixa. O nome sugerido pela pasta deve ser revisado; nao equivale a uma identificacao automatica de evento.

Nao inclui pixels de RAW ou JPEG, pesos de modelo nem credenciais. Os JPEGs tecnicos continuam na pasta local da tarefa. `references.jsonl` inclui caminhos e preferencias privadas: manter no ambiente do usuario. Nao ha servidor ou upload automatico. Somente os dez controles basicos estao no escopo atual; curvas, HSL, perfis e mascaras precisam de coleta/avaliacao proprias.

Os resultados nao sobrescrevem tarefas anteriores. O coletor usa os mesmos leitores e atributos do treino; confere hash/estabilidade dos RAWs e escreve somente arquivos da nova tarefa. O modelo nao e treinado nem ativado pela coleta.

## QA e uso

45 testes Python/Lua 5.1 passaram. Um RAW real exportou os 40 atributos exatamente iguais aos do dataset anterior e preservou os dez alvos aprovados, sem previsoes no lugar dos alvos. O JSONL dessa referencia teve 3.034 bytes e nao contem pixels. A aprovacao foi simulada pelo driver de QA nessa fixture; esse arquivo nao e um novo exemplo aprovado pelo humano para treino. Recibo em `evidence/reference-collector-qa-20261029.json`.

A nova janela usa bindings documentados no guia primario Adobe, pagina 100. Foi testada com Lua 5.1 e doubles; exige teste nativo no Lightroom 15.6. Diagnostico/inferencia do pacote anterior ja foram confirmados pelo usuario, mas isso nao valida automaticamente a nova coleta.

1. Instalar o novo pacote em pasta separada, preservando a anterior e usando o mesmo procedimento do Gerenciador de plug-ins.
2. Testar a coleta com cinco RAWs originais em cor cujos ajustes estejam aprovados.
3. Revisar o nome do trabalho, confirmar a aprovacao e iniciar. Ao concluir, Mostrar references.jsonl revela o arquivo; Ver ultimos resultados tambem reabre a ultima coleta/analise.
4. Depois do teste, coletar 50 a 100 fotos variadas por trabalho, usando o mesmo nome nas varias coletas do mesmo evento. Reunir pelo menos tres trabalhos; reservar um ainda nao examinado para avaliacao final.
5. Transferir somente o JSONL em subpasta por trabalho/coleta para o compartilhamento de entrega. Preservar RAWs e demais arquivos locais.

O treinador seguinte devera validar dominio/versoes/aprovacao, deduplicar hashes entre todas as coletas, impedir que o mesmo RAW apareca em treino e avaliacao e separar eventos antes de selecionar hiperparametros. Coletas do mesmo trabalho devem ficar no mesmo grupo. O trabalho de 24/10 e a coorte de cinco ja analisada sao observacoes conhecidas, sem status de teste final intocado.

O novo pacote tambem revela results.json dentro da pasta correta e mostra o erro do motor quando o relatorio existe. Isso facilita a transferencia dos arquivos e o diagnostico de falhas sem alterar o catalogo.
