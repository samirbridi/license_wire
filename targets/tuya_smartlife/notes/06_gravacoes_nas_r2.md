# 06 — Gravações no NAS e backup R2 (build 0044)

*Claude Code, 2026-10-28/29.*

## Organização no Volume 4

```text
/volume4/HDD 1TB - V2/Mizin-Cameras/
├── outdoor_pro_poste/
│   └── 2026-10-28/
│       ├── 14-00-00.mkv          # visão principal
│       ├── 14-00-00_visao2.mkv   # segunda visão da Outdoor
│       ├── 14-15-00.mkv
│       └── .meta/14-00-00.json   # id, início, duração, SHA-256, codecs
├── aw300_garagem/2026-10-28/...
├── status.json                   # estado do gravador, disco e retenção
└── retention-events.ndjson       # auditoria de cada exclusão
```

- Uma pasta por câmera, uma pasta por dia no fuso de São Paulo e arquivos nomeados pelo horário local de início. Um segundo arquivo no mesmo segundo recebe `_2`, `_3`…; nada é sobrescrito.
- Os arquivos antigos (raiz, `<id>.mkv` ou `AAAA/MM/DD`) são migrados ao iniciar o gravador por hard link, sem reescrever bytes (`organizeLegacy`).
- Segmentos de **15 minutos alinhados ao relógio** (`-segment_atclocktime`): os cortes ocorrem em :00/:15/:30/:45, no quadro-chave seguinte. Isso dá 96 arquivos por visão por dia, em vez de 288 com 5 minutos. Uma única conexão por visão permanece aberta entre os segmentos.
- O teste de 10 s por câmera continua validando vídeo+áudio, mas o arquivo de teste não fica mais no acervo.

### Por que segmentos e não um arquivo único

- Uma queda de energia ou de rede perde no máximo o segmento em andamento.
- A linha do tempo abre o arquivo do horário e busca dentro dele (`/api/camera/archive/file?id=…&start=segundos`), sem ler horas de vídeo.
- A retenção e o backup trabalham em unidades pequenas: apagar ou enviar 15 minutos é barato e auditável.
- Arquivos de 15 min (~100–400 MB) ficam abaixo do limite de 2 GiB por objeto do sincronizador R2.

## Retenção sem limite fixo

Variáveis do serviço `recorder` (compose):

| Variável | Valor | Efeito |
|---|---|---|
| `MIZIN_ARCHIVE_LIMIT_GB` | `0` | sem cota fixa; `>0` limita a pasta de câmeras |
| `MIZIN_ARCHIVE_HIGH_WATER` | `0.90` | inicia a limpeza com 90% do volume ocupado |
| `MIZIN_ARCHIVE_LOW_WATER` | `0.85` | limpa até 85% |
| `MIZIN_ARCHIVE_RESERVE_GB` | `40` | piso de espaço livre; abaixo dele a gravação pausa |
| `MIZIN_ARCHIVE_REQUIRE_BACKUP` | `0` | `1` = nunca apaga arquivo sem cópia confirmada no R2 |
| `MIZIN_ARCHIVE_SEGMENT_MINUTES` | `15` | duração do segmento |

Ordem de exclusão: (1) gravações mais antigas **já confirmadas no R2** (bytes, SHA-256 e ETag); (2) se ainda faltar espaço e `REQUIRE_BACKUP=0`, as mais antigas sem cópia. Nunca apaga `.partial`, arquivos desconhecidos ou gravações com menos de 15 minutos. O gravador lê o estado do R2 em `/cloud-state/r2-state.json` (somente leitura).

## Backup R2

- O sincronizador envia **do mais antigo para o mais novo**, para estender o histórico que o NAS vai apagar.
- Chave remota: `recordings/<camera>/<AAAA-MM-DD>/<HH-MM-SS>.mkv`, o mesmo caminho do NAS.
- `MIZIN_R2_MAX_GB` (padrão 120) e `MIZIN_R2_MIB_PER_SECOND` (padrão 1) no serviço `cloud-backup`. Aumentar o limite é decisão de custo do proprietário: ~US$0,015/GB-mês (1 TB ≈ US$16/mês só de armazenamento).
- Continua desativado até haver credenciais S3 exclusivas do bucket `homecams-recordings`.

Estimativa de volume, a partir da amostra da Outdoor (10,023 s = 1,2 MB ≈ 1 Mbps): cerca de 10 GB por visão por dia, ~70 GB/dia com 7 visões. O NAS de 1 TB comporta cerca de 11–12 dias; 120 GiB no R2 comportariam menos de 2 dias. Medir no NAS após 24 h de gravação contínua antes de definir o limite do R2.

## Linha do tempo no portal

`/api/camera/archive?day=AAAA-MM-DD&camera=<id>` devolve as gravações do NAS e as que restam só no R2 (`location`: `nas`, `nas+cloud`, `cloud`), além de `days`, `status` e `backup`. A tela "Gravações" mostra uma barra de 24 h por visão; clicar num ponto reproduz a partir daquele segundo. Itens só na nuvem são baixados por URL assinada (`/api/auth/cloud/download`).

## Pendências

- Publicar a build 0044 no NAS (Container Manager) e o Pages juntos: a nova tela depende de `days` na resposta da API.
- Medir taxa real por visão após 24 h e decidir `MIZIN_R2_MAX_GB`.
- Reprodução direta de itens só na nuvem (hoje apenas download).
- `/api/ev/command` agora responde 501 honestamente; a integração real GWM/BYD e a inclusão dos clientes no pacote do NAS continuam pendentes.
