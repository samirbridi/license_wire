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

Python usado: `C:\Users\Avell Mizin\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe`.
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
