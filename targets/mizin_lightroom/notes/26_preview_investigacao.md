# Investigacao de previas e layout

Menu principal sem prefixo CRISPIX e titulos maiusculos. Preparacao com largura explicita de 520 e controles 490 em vez de dimensionamento por caracteres; ainda requer QA visual host. Suite em evidence/qa-layout-next.txt.

Referencia SDK consultada: https://archive.stecman.co.nz/files/docs/lightroom-sdk/API-Reference/modules/LrPhoto.html, copia evidence/sdk-photo-reference.html. requestJpegThumbnail retorna JPEG do sistema de preview, pode renderizar se nao houver; demanda task assincrona e manter referencia do objeto ate callback. Isso NAO e acesso garantido ao DNG Smart Preview nem garante entrada sem ajustes. Nao usar como substituto silencioso do dominio LibRaw do modelo. Proxima etapa precisa obter contratos de smart preview e validar pares de features/treino. Nao houve implementacao de inferencia por smart preview nem pacote novo nesta etapa.
