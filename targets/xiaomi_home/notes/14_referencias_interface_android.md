# Referências indicadas pelo proprietário — 2026-10-26

## Decisão de validação

O proprietário escolheu **somente prévia no navegador por enquanto**. Não foi instalado Artemis, emulador, helper de acessibilidade ou configuração MCP global. Prévia responsiva não equivale a Android físico, e não mostra o Xiaomi Home Android real sem um dispositivo ou emulador conectado.

## Artemis

[google/artemis](https://github.com/google/artemis), árvore consultada `351ca8422f7b5b54e80a9c1ce03a222e02415b6b`, oferece automação Android, espelhamento, screenshots e logs via dispositivo/emulador conectado. O README documenta ADB/depuração, instalador Windows e MCP. O instalador pode preparar ferramentas e propor configurações e regras globais para IDEs; não foi executado. A automação pode ajudar a comparar os fluxos visíveis do Xiaomi Home e testar nosso cliente. Ela não demonstra acesso independente aos protocolos de vídeo, SD ou motores. Licença declarada: Apache-2.0.

## Morphicons

[guillermolg00/morphicons](https://github.com/guillermolg00/morphicons), árvore consultada `8c3e3c7cd717b2381f8f35cf6c245afd80d8d7df`. Integração por `createMorph` no DOM, sem mudar o framework da central. Pacote npm fixado em 2.0.2, baixado com scripts desativados, SHA-512 comparado à integridade do registro. Módulos transitivos servidos localmente por lista explícita; nenhum CDN no cliente. Licença MIT preservada junto aos módulos. Os desenhos SVG são próprios; a biblioteca anima as transições áudio mudo/ativo e visão ampliada/dupla. `reducedMotion: user` respeita a preferência do sistema. Proveniência: `evidence/morphicons-vendor.json`.

## Integração oficial Home Assistant

Os links com `xiaomi` e `XiaoMi` identificam o mesmo [ha_xiaomi_home](https://github.com/XiaoMi/ha_xiaomi_home). A árvore consultada é `75b3acb6325a3a8d295688b13904737d6738a6a5`. O README documenta OAuth e MIoT; `SUPPORTED_PLATFORMS` não inclui `camera`, e não foi localizado `camera.py`. Assim, essa versão não fornece um player de câmeras pronto para o nosso caso. Propriedades MIoT de dispositivos são uma questão separada da entrega de vídeo e dos arquivos SD.

A [licença](https://github.com/XiaoMi/ha_xiaomi_home/blob/main/LICENSE.md) limita a autorização ao uso não comercial no Home Assistant e exclui o uso da obra licenciada para desenvolver outros apps e serviços web. Não foram incorporados código, identificador OAuth ou APIs licenciadas desse projeto à central independente. Uma instalação Home Assistant sob seus próprios termos pode ser avaliada separadamente.

## Cloud Map Extractor

[Xiaomi Cloud Map Extractor](https://github.com/PiotrMachowski/Home-Assistant-custom-components-Xiaomi-Cloud-Map-Extractor) produz imagens de mapas de aspiradores Xiaomi/Roborock/Viomi/Roidmi/Dreame. A entidade `camera` representa a imagem do mapa; isso não constitui suporte a AW300, HLC7 ou CW701, nem demonstra transmissão de vídeo ou leitura de seus cartões. Não foi instalado.

O [perfil Xiaomi](https://github.com/xiaomi) serve como índice de projetos; cada repositório exige verificação própria de finalidade, licença e suporte por modelo.
