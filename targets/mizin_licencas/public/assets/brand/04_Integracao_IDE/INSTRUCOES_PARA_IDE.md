# PLUGNEX — identidade visual e handoff para IDE
Versão 1.0 • Proposta de padronização a partir do logo aprovado.

## 1. Objetivo
Portal de plugins, instalação, atualização e gerenciamento de licenças. Marca independente, inicialmente voltada ao Resolume Arena, extensível a outros hosts. Não insinuar afiliação oficial com o Resolume. Assinatura opcional: **by Mizin**. Slogan proposto: **Discover. Install. Create.** Não incorporar slogan ao logo principal.

## 2. Referência e hierarquia de ativos
- `01_Referencia/PLUGNEX_original_aprovado.png`: imagem original aprovada, preservar sem modificar. É a referência estética e não é transparente.
- `02_Logos/plugnex-stacked-color.svg`: reconstrução vetorial em curvas, com gradientes e sem imagens embutidas. Usar como marca principal em fundo escuro. A geometria e iluminação foram aproximadas da referência; não é uma conversão pixel a pixel. PNG homônimo é transparente, renderizado a partir do vetor.
- `02_Logos/plugnex-original-pixels-cutout.png`: recorte aproximado do original, com máscara derivada do vetor; preserva os pixels internos, mas pode ter pequenas diferenças nas bordas. Não é vetor.
- `plugnex-horizontal-color.svg`: cabeçalho e navegação; `plugnex-symbol-color.svg`: símbolo; `plugnex-wordmark-color.svg`: lettering em curvas. Prefixo `plugnex-` e sufixo `-light` indicam versões com lettering escuro para fundos claros; `-white` e `-dark` são versões monocromáticas. As versões monocromáticas são simplificações.
- `03_Icones/plugnex.ico`: recurso para executável Windows; PNGs 16 a 1024 px; `favicon.png` para web. `splash-1920x1080.png` e SVG correspondente são fundos sem texto de progresso fixo.
- As pranchas ilustrativas em `01_Referencia` são inspiração, não fonte normativa: elas apresentam divergências de cores, tipografia e espaçamento. Este manual e os tokens definem uma única proposta consistente.

## 3. Identidade
Três módulos interligados, núcleo play e órbita: integração, audiovisual e ecossistema. X em ciano/violeta. Não reconstruir o lettering com fontes de texto; usar o SVG fornecido. Exo 2 (600–700) para títulos; Inter (400–600) para UI e texto. Fallback Segoe UI/system-ui. Obter fontes de fontes oficiais, respeitar licenças e hospedar localmente se necessário. Fontes não estão incluídas.

## 4. Tokens de design
Usar `brand-tokens.json` e `plugnex-theme.css` como fonte única. Fundos navy, cards com borda discreta, texto claro, azul para CTA, ciano para foco/atividade e violeta para identidade. Verde, amarelo e vermelho são estados semânticos, não cores primárias do logotipo. Não usar glow excessivo. Não depender exclusivamente de cor para comunicar estados.

| Token | HEX |
|---|---|
| background | `#0A0B1E` |
| surface | `#111B3D` |
| surfaceElevated | `#172344` |
| border | `#293859` |
| primary | `#2F6BFF` |
| cyan | `#00E5FF` |
| violet | `#A855FF` |
| text | `#F5F7FF` |
| muted | `#A8B5D0` |
| success | `#39D98A` |
| warning | `#FFC857` |
| danger | `#FF657A` |

## 5. Aplicação e responsividade
Preservar proporções do viewBox; `object-fit: contain`. Margem livre recomendada: 1/4 da altura do símbolo em cada lado. Mínimos iniciais de UI: logo vertical 160 px de largura, horizontal 180 px, símbolo 32 px; abaixo disso usar ícone dedicado e conferir visualmente. Impressão: iniciar em 30 mm (vertical), 35 mm (horizontal), 10 mm (símbolo); testar prova antes de produzir. Não esticar, rotacionar, recolorir, trocar os encaixes, inverter o gradiente, aplicar sombras extras ou usar em fundos poluídos. Para fundo claro, usar `-light` ou `-dark`.

## 6. Prompt de implementação — executar no projeto existente
1. Antes de alterar, inspecionar stack, estrutura de assets, tema, componentes e processo de build. Criar branch/backup. Não substituir código funcional nem remover funcionalidades.
2. Copiar ativos deste kit para o diretório de recursos apropriado, manter nomes e versões. Usar SVG na web e em UI compatível; PNG transparente em renderizadores sem SVG; ICO como recurso de aplicação Windows e do instalador, conforme a tecnologia existente. Não embutir PNG dentro de SVG.
3. Mapear tokens para o sistema de design atual sem duplicar constantes. Ajustar tema, splash, login, barra superior, catálogo, biblioteca, detalhes, licenças, configurações e estados vazios. Usar logo horizontal no header, símbolo no menu compacto, versão vertical em login/splash. Barra de progresso dinâmica e mensagens reais, nunca imagens estáticas de progresso.
4. Manter densidade profissional: grid responsivo de cards, navegação lateral, status de instalação/licença/atualização separados. Sugestão de labels: Installed, Update available, Not installed, License active, Trial, Expired, Offline. Localizar pelo mecanismo existente; sugeridos en-US e pt-BR. Não inventar estados nem simular ativação real.
5. Acessibilidade: verificar contraste WCAG AA (4,5:1 texto normal, 3:1 texto grande), foco por teclado, nomes acessíveis para ícones, zoom 100/125/150/200%, texto longo, redução de movimento. Validar as cores reais de cada combinação; não presumir conformidade automática.
6. Segurança: preservar autenticação, backend, instalação e licenciamento. Identidade visual não implementa DRM; não colocar segredos, chaves privadas ou lógica de confiança exclusiva no frontend. Não afirmar proteção absoluta contra cópias.
7. Testar build, instalador, ícone em Explorer/taskbar, splash, tema, navegação, DPI e regressões. Confirmar que SVGs não têm imagens ou fontes incorporadas, que PNGs têm alpha e que telas não cortam logo. Entregar screenshots comparativas e resumo das alterações, testes e pendências.

## 7. Critérios de aceite
- A imagem aprovada permanece intacta; vetor é apresentado como reconstrução, não réplica exata.
- Branding consistente em todas as telas; lettering não substituído por texto.
- Sem regressão em licenças, instalação e atualização; sem credenciais novas no cliente.
- Assets e tema versionados; build e testes documentados.

## 8. Pendências
Aprovação visual final da reconstrução em curvas, das versões reduzidas e dos tokens; teste real no app; prova de impressão e eventual conversão CMYK; verificação de disponibilidade comercial do nome e registro de marca. Nenhum desses testes externos foi executado neste kit.
