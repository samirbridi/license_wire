"""Generate delivery and handoff documentation from measured local evidence."""
import json
from build_graph import ROOT,SOURCE


def write(path,text):
    (ROOT/path).write_text(text.strip()+'\n',encoding='utf-8')


def main():
    source=json.loads(SOURCE.read_text())['patch']
    qa=json.loads((ROOT/'evidence/native-qa.json').read_text()) if (ROOT/'evidence/native-qa.json').exists() else {'pass':False,'checks':[]}
    receipt=json.loads((ROOT/'evidence/build-receipt.json').read_text()) if (ROOT/'evidence/build-receipt.json').exists() else {}
    version=(ROOT/'VERSION').read_text(encoding='utf-8-sig').strip()
    nodes=len(source['nodes']);connections=len(source['connections'])
    status='PASS' if qa['pass'] else 'EM VALIDACAO'
    build_status=receipt.get('status','PENDENTE')
    semantic=version.split(' ')[0]
    write('README.md',f'''
# Slice Refine Pro by Mizin

Reconstrução independente em Resolume Wire, baseada na análise do **SLICE REFINER v2.0**, de kpt hippo.
Formato preservado: fonte editável `.wire` e efeito compilado `.cwired`.
Versão calculada pelos commits: **{version}**. Compilação: **{build_status}**. QA no Wire: **{status}**.

## O que foi entregue

- Quatro grupos, cada um com lista de slices, ativação, quatro raios independentes em pixels,
  multiplicador dos cantos, espessura, inset, cor, opacidade, animação e fase.
- Seis modos por grupo: Static, Pulse, Chase, Breathe, Strobe e Color Flow.
- Relógio compartilhado com velocidade manual em Hz ou frequência derivada do BPM.
- Três saídas: Refine + Stroke, Inside Slices e Outline Only; suavização opcional e fundo preto opcional.
- Geometria nativa 2D instanciada como caminho padrão; alternativa SDF para conservar bordas internas
  sobrepostas, selecionada ao desligar Merge Edges. Essa alternativa tem custo maior.
- Painel organizado em seis grupos. Fonte independente: {nodes} nós e {connections} conexões,
  identificador próprio `4c13d7fe-8506-5f66-bc59-2e6665c3ac4c`.

## Usar no Resolume

1. Instale o `.cwired` gerado usando o procedimento de patches Wire do seu Resolume.
2. Aplique o efeito ao vídeo. Em Group 1 a Group 4, atribua os slices desejados.
3. Comece com Merge Edges ligado, Corner Segments = 16 e Soft Edges px = 0.
4. Ajuste cada canto em pixels da composição; Corner Scale altera os quatro raios daquele grupo.
5. Selecione a animação por grupo. Motion Amount = 0 neutraliza a modulação;
   BPM Sync desligado habilita Speed Hz; ligado usa BPM Multiplier.
6. Use Inside Slices para remover conteúdo fora dos slices, ou Outline Only para uma camada de contornos.

No Wire, a fonte abre com Test Card e cinco slices Droid apenas como dispositivos de prévia.
Eles não substituem a atribuição dos slices da sua composição no Arena.
`Slice Refine Pro by Mizin.wire`, na pasta de mesmo nome, é a fonte de desenvolvimento.
O pacote de cada release contém o `.wire` com nome e descrição da versão, o `.cwired`, VERSION,
CHANGELOG e BUILD.json com hashes e commit de origem.

## Como o original funciona

O arquivo recebido é um contêiner Wire, não uma DLL. Foi recuperado um único `patch.wire`, sem
recursos externos: **308 nós, 445 conexões e quatro grupos de slices**. Slice Info fornece dimensão,
centro e rotação; operações de coleção e matemática aplicam os parâmetros; Rectangle/Transform/Shape Render
geram as formas, e máscaras/composição combinam os cantos e contornos com o vídeo.
O grafo original já usa instâncias e saída escalar. Não há evidência de que crie um framebuffer por slice.
A nova implementação foi construída separadamente a partir de classes públicas do Wire.
Ela mantém os controles centrais e traz seu próprio conjunto de animações; não é uma atualização oficial
do fabricante e não converte presets antigos automaticamente.

## Desempenho medido

GTX 1660 Ti, 3840×2160, duas ordens de execução, cinco amostras por execução. Medianas de ocupação da GPU inteira:

| Formas | Núcleo SDF | Núcleo 2D |
|---|---|---|
| 16 | 12–14% | 10–11% |
| 64 | 77–82% | 11–12% |
| 144 | 97% | 9–10% |

Esses dados comparam **somente o núcleo geométrico** em cenas sintéticas isoladas, com raios físicos equivalentes.
Não são FPS nem tempo por processo e não comparam o plugin original completo contra o novo completo.
A correspondência das máscaras de uma forma teve IoU de aproximadamente 0,994, com diferenças de rasterização nas bordas.
O ensaio anterior com ambos os caminhos no mesmo grafo foi rejeitado e está marcado como inválido.
Dados: `evidence/core-benchmark.json`; método: `notes/06_validation.md`.

## Compatibilidade e limites

- Fonte criada e renderizada no Wire **7.28.1.26535**, deployment target nativo **7.27.0**.
  Não foi comprovada compatibilidade com versões anteriores.
- Retângulos com rotação são o contrato da implementação. Deformações arbitrárias dos vértices,
  máscaras complexas do Advanced Output e composição com slices sobrepostos precisam de ensaio no seu projeto.
- Com Merge Edges ligado, o contorno é a diferença entre a união das formas exteriores e a união das interiores.
  Sobreposições podem eliminar trechos internos; desligue a opção para desenhar as bordas individualmente.
- A validação local cobre {len(qa['checks'])} verificações no Wire, incluindo grupos de 5, 4, 9 e 16 slices,
  transparência, limites, animações e resoluções paisagem/retrato/4K.
- **Reprodução do `.cwired` no Arena e avaliação visual no projeto real permanecem pendentes.**
  O conector encontrou o Arena fechado durante esta sessão.
- O original e a cópia de evidência foram preservados. Nenhum patch de licença ou alteração do runtime foi aplicado.

## Estado Atual e Próximos Passos

Análise estrutural concluída, nova fonte implementada, QA Wire **{status}**, build **{build_status}**.
Próximo passo de operação: instalar o efeito em um projeto de teste do Arena, atribuir os slices reais,
verificar rotação/overlap e observar FPS/GPU na resolução do show. Depois disso, avaliar presets adicionais.
Não foi feita publicação no Acervo, upload ou substituição do original.

## Rastreabilidade e reprodução

Consulte `notes/01_overview.md` a `notes/06_validation.md`, `evidence/native-qa.json`,
`evidence/build-receipt.json`, `binaries/SHA256SUMS.txt` e o mapa `evidence/reconstruction-node-map.json`.
As evidências privadas extraídas ficam em `evidence/raw-bundle/` e não entram no pacote de entrega.
O comando de compilação é registrado literalmente no recibo. O versionador lê apenas commits estruturados
que alteraram este alvo, desde a última versão; cada compilação reserva um novo build e gera changelog com SHA.

Referências oficiais: [Slice Refiner](https://kpthippo.com/slice-refiner/),
[compilação Wire](https://resolume.com/support/en/wire-saving-consolidating).
''')
    write('notes/01_overview.md','''
# Visão geral e proveniência

Entrada: `C:\\Users\\Avell Mizin\\Downloads\\P2P_HTTP\\SLICE REFINER.cwired`, 230087 bytes.
SHA-256: `3299103010c89a2699f76ef1ae19724023694d76750b93223b42746f64a68de1`.
Cópia em binaries preservada e verificada. Original: kpt hippo, SLICE REFINER v2.0,
save target 7.14.2, deployment target 7.14.0, original target 7.11.0.

Triagem: cabeçalho de contêiner v1, alta entropia e ausência de PE/ZIP. A CLI REA 6.7.0
não reconheceu esse formato: `evidence/rea-artifact.json`. Seguiu-se análise estática do
runtime instalado WireLib.dll via Ghidra, com resultados em evidence/bundle-*.c.
O contêiner contém apenas patch.wire, 229959 bytes, SHA-256
`5ea3e293b9ea8f2c37067f5a1f6e393030800c3eabad56a81150c8ca41809365`.

O fluxo de análise não altera o arquivo recebido, o editor instalado ou a autorização do produto.
A reconstrução tem novo UUID e autoria próprios. O patch proprietário extraído fica em evidência privada,
não é a fonte do build independente nem faz parte do ZIP de entrega.

Entradas funcionais do efeito: vídeo RGBA, listas de slices e parâmetros expostos pelo host.
Saída funcional: uma textura RGBA. O grafo não contém ISF, DLL personalizada ou recurso externo.
Não foi identificado protocolo de rede próprio no arquivo analisado.
''')
    write('notes/02_architecture.md',f'''
# Arquitetura observada e reconstruída

Original: 308 nós e 445 conexões. Inventário e ligações em evidence/original-graph-analysis.json.
Quatro Slice In alimentam Slice Info; dimension/center/rotation seguem para operações matemáticas,
coleções e retângulos SDF. Map/Switch ajustam controles e modos. As famílias Rectangle, Edge,
Transform, Shape Render, Mask e Merge produzem a saída do efeito. Shape Render já agrega
instâncias em textura escalar: os registros original-live-node-70/88/97.json impedem a alegação
incorreta de N texturas de saída para N slices.

Implementação nova: {nodes} nós, {connections} conexões, construída a partir de um scaffold próprio.
Os controles de cada grupo são expandidos pelo Size da sua coleção antes de Join. Assim,
grupos de tamanhos diferentes mantêm cor, raio, fase e animação alinhados ao slice correto.
Um Slice Info compartilhado fornece os dados geométricos. Conversão pixel→mundo = 2/altura.
Raios físicos independentes são limitados a metade da menor dimensão após o inset.

```mermaid
flowchart LR
  A[4 grupos de slices e controles] --> B[Expand por grupo e Join]
  B --> C[Slice Info e conversão de coordenadas]
  C --> D[Rectangle 2D + Transformation 2D]
  D --> E[Mesh 2D + 2D Render]
  E --> F[Máscaras exterior, interior e footprint original]
  V[Vídeo] --> G[Composição e modo de saída]
  F --> G
  H[Relógio compartilhado e animações] --> D
  H --> E
  G --> O[Texture Out]
```

O stroke padrão é exterior menos interior; os recortes preservam o conteúdo fora dos slices no modo
Refine + Stroke. Inside Slices aplica a máscara arredondada ao vídeo; Outline Only fornece RGBA transparente.
Um ramo SDF explícito conserva contornos internos, com custo maior. Switches de modo usam fluxo attribute.
Zero stroke anula o material para impedir o halo residual A×(1−A) das máscaras antialiased coincidentes.
Zero opacidade e grupo desativado também produzem alpha zero no modo Outline Only.

O novo Chase usa índice global na coleção concatenada e fase por grupo. Breathe varia escala entre
1 e 1−0,2×Motion Amount; Pulse/Chase/Strobe modulam intensidade, Color Flow interpola as cores.
Não há promessa de equivalência entre presets/efeitos proprietários e o novo conjunto.
''')
    write('notes/03_protocols_apis.md','''
# APIs e comandos reproduzíveis

Não há API de rede própria no patch. A automação do editor usa a REST pública local do Wire:
`http://127.0.0.1:8081/api/v2`. Ela serve à construção e QA; o plugin compilado não depende desse servidor.
`scripts/wire_api.py` registra as operações; o transporte MCP por named pipe não estava acessível,
por isso foi usado HTTP. O catálogo nativo está salvo em evidence/wire-classes.json.

Operações verificadas: POST /patch/open; POST /patch/nodes com class_id e position;
POST /patch/connections; POST /patch/nodes/{id}/inlets/{port}/value com valor JSON direto;
GET /patch/nodes?limit=2000; GET /patch/connections?limit=10000; POST /patch/save.
Grupos de painel: POST /patch/inputs/groups e POST /patch/inputs/{id}/move.
PNG real: GET /patch/nodes/{id}/outlets/{port}/live?width=960&height=540 com Accept: image/png.
Status 204 não equivale a uma imagem renderizada; o cliente exige cabeçalho PNG válido.

Python usado: `C:\\Users\\Avell Mizin\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\python\\python.exe`.
Dependências dos ensaios: NumPy e Pillow já disponíveis. Extrator e versionador usam apenas biblioteca padrão.

Na raiz do repositório, após a extração e o scaffold de provas existente:

```powershell
& $python targets/slice_refiner/scripts/extract_bundle.py
& $python targets/slice_refiner/scripts/analyze_graph.py
& $python targets/slice_refiner/scripts/build_graph.py
& $python targets/slice_refiner/scripts/extend_graph.py
& $python targets/slice_refiner/scripts/add_refinements.py
& $python targets/slice_refiner/scripts/fix_zero_stroke.py
& $python targets/slice_refiner/scripts/organize_panel.py
& $python targets/slice_refiner/scripts/finalize_source.py
& $python targets/slice_refiner/scripts/qa_native.py
& $python targets/slice_refiner/scripts/benchmark_core.py
& $python targets/slice_refiner/scripts/test_version.py
# Depois de registrar as fontes validadas em commit estruturado deste alvo:
& $python targets/slice_refiner/scripts/build_release.py
```

`$python` deve apontar para o executável acima. Build_release verifica o QA, reserva versão automaticamente,
carimba uma cópia da fonte, chama Wire.exe compile com --output, confere identidade/grafo do contêiner
gerado, grava recibo e cria ZIP. Não usa --juicebar nem reutiliza publisher do original.
O VERSION inicial foi gerado pelo inicializador do alvo; versões de entrega vêm do histórico real de commits.

REA executado: `npx.cmd -y rea-agents analyze <original.cwired> --provider ghidra --json`.
Ghidra usa ghidra/DumpFunctions.java e endereços listados na nota 04. Projeto local runtime_wire.gpr.
O log de importação e console ficam em evidence/ghidra-*.log; nenhum é requisito de execução do efeito.
''')
    write('notes/04_crypto_security.md','''
# Contêiner Wire v1: formato verificado

Evidência estática: WireLib.dll instalado, SHA-256
`577fcef3fb0bdf6fff502f133ffe44024a9d662074952bd7571380c3e5757a05`.
Endereços virtuais referem-se a essa imagem x64: base 0x180000000.

| Campo | Offset | Leitura |
|---|---|---|
| Versão | 0 | u16 big-endian = 1 |
| Quantidade de entradas | 2 | u32 big-endian = 1 |
| Tamanho da tabela | 6 | u32 big-endian = 20 |
| Flag da tabela | 10 | byte = 1 |
| Nonce | 11 | 8 bytes |
| Tabela | 64 | 20 bytes, criptografados |
| Payload | 128 | patch.wire, 229959 bytes |

Cada item da tabela: u16 BE de tamanho do caminho + caminho UTF-8 + u64 BE do tamanho do conteúdo.
O payload e cada próxima entrada são alinhados a 64 bytes. O nonce recebido é fb5fde6049a70122.
Salsa20/20 é posicionado pelo offset absoluto do arquivo, inclusive para descriptografar a tabela.
O ramo .cwired deriva sua chave pelo XOR do material do runtime com BLAKE2b-256 de sourceeffectmixer.
O ramo .wired usa diretamente o material-base. Não se trata de SHA-512 nem de digest SHA-1 no offset 64.

Referências: bundle-header.c (0x1805e1ed0), bundle-directory.c (0x1805e20f0),
bundle-factory.c (0x180151340), bundle-crypto.c (0x180153600, 0x180c03b70/60),
bundle-cipher.c (0x1805e45b0, 0x1805e4840). scripts/extract_bundle.py e salsa20.py
reproduzem a leitura; o parser valida limites, caminhos relativos, comprimentos e estrutura JSON.

Este contêiner não fornece, no formato observado, autenticação criptográfica do conteúdo.
A integridade da análise foi aferida por hashes SHA-256, estrutura e parsing, não por uma assinatura validada.
Nenhum teste de ativação comercial ou API proprietária de licenciamento foi realizado.
Não se alteraram executáveis, licença, publisher ou UUID do original. A nova implementação tem identidade própria.
''')
    write('notes/06_validation.md',f'''
# Validação local e limites das medições

QA completo no Wire: **{status}**, {len(qa['checks'])} verificações, relatório evidence/native-qa.json.
O ensaio usa cópias temporárias e restaura a fonte de desenvolvimento em finally.
As imagens de evidence/qa/ são saídas reais da GPU obtidas por HTTP, não desenhos simulados.
Verificações: recarga sem perda de nós/conexões; seis grupos de painel; alpha; canto TL sem alterar TR;
opacidade zero; grupo desativado; espessura zero; inset degenerado; raios extremos; fundo preto;
ramo SDF; feather; seis animações; coleções de 5/4/9/16 e isolamento de cor do grupo 2;
1080×1920 e 3840×2160. O caso base usa 1920×1080.

O primeiro QA revelou halo com stroke zero; o material passou a ser anulado nesse caso e o teste foi repetido.
Uma conexão HTTP também foi encerrada pelo editor durante a inicialização de uma cópia;
escritas idempotentes de constantes têm repetição limitada, registrada no JSON se ocorrer.
Falhas não são convertidas silenciosamente em sucesso.

Benchmark geométrico: scripts/benchmark_core.py, evidence/core-benchmark.json e evidence/benchmark-isolated.log.
GTX 1660 Ti, 4K, 16/64/144 retângulos arredondados, uma pipeline por patch, duas ordens alternadas,
cinco amostras NVIDIA por execução após aquecimento. Medida: ocupação da GPU inteira via nvidia-smi;
outros processos podem interferir. Não há medição de FPS ou tempo de GPU por processo.
Raios físicos equalizados: round_SDF = 4×raio_mundo/(largura_mundo+altura_mundo).
A IoU alpha binária de um retângulo foi aproximadamente 0,994; diferenças de rasterização permanecem.
O ensaio com as duas pipelines no mesmo grafo foi rejeitado e está em core-benchmark-mixed-invalid.json,
com valid_for_performance_comparison=false. Não usar esse arquivo como ganho de performance.

Compilação: **{build_status}**. O recibo evidence/build-receipt.json registra comando, exit code, SHA-256,
versão do compilador, commit da fonte e equivalência do grafo serializado após compilar.
O ZIP de entrega exclui o original e sua fonte recuperada. A checagem de contêiner não demonstra playback.
Arena fechado na consulta ao conector; execução do `.cwired` no Arena, slices reais, rotação e sobreposição
no projeto de show, aprovação visual e painel físico permanecem pendentes.
''')


if __name__=='__main__':main()
