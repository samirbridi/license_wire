# 07 — Publicação no NAS e no portal (procedimento automático)

*Claude Code, 2026-10-29. Builds 0046 e 0047 publicadas assim.*

## Fluxo

1. Commit com `tipo: descrição` e `node scripts/version-build.mjs --build --run-id <id>` → `runtime/builds/build-XXXX`.
2. `python scripts/prepare-nas-package.py --code-only` → `evidence/private/nas-portal-build-XXXX/`.
3. Pacote só de código (~320 KB, sem o binário go2rtc de 30 MB, idêntico entre builds):
   `python -I <scratchpad>/mkcodezip.py evidence/private XXXX` → `nas-portal-build-XXXX-code.zip` e `compose-volume4-XXXX.yaml`. O script está reproduzido abaixo.
4. No Chrome (Claude in Chrome) com o DSM `https://192.168.1.186:5001` autenticado: criar `<input type=file id="mizinUpload">`, anexar o zip com `file_upload`, colar `scripts/nas-dsm-deploy.js` e chamar `mizinDeploy({build, previous, zipSha256, composeSha256, previousComposeSha256})`.
   - `composeSha256`: SHA-256 do compose com finais LF; `previousComposeSha256`: SHA-256 do compose anterior com LF e `trim()`.
   - O script confere o SHA-256 do zip, extrai, copia a ponte verificada da build anterior, confere o compose e **só substitui o projeto se a configuração ativa for exatamente a anterior**. Depois dispara "Construir" (`build_stream`); o progresso fica em `window.__build`.
5. Pages: copiar `runtime/builds/build-XXXX/public` para `runtime/pages-build-XXXX/public`, acrescentar `_worker.js` = `cloudflare/pages.mjs` e rodar `node runtime/cloudflare-cli/node_modules/wrangler/bin/wrangler.js pages deploy public --project-name homecams --branch main --commit-dirty=true`.
6. Validar: `/api/health` (versão, `sameNetwork`), `/api/camera/archive` (status do gravador) e telas no navegador.

Projeto do Container Manager: `mizin-home` (id `9d574df2-822f-44f9-9918-d31c75409ab7`), pasta `/volume4/HDD 1TB - V2/Mizin-Home/nas-portal-build-0040`. As builds ficam em `Mizin-Home/nas-portal-build-XXXX`. Os erros "Pulling … Error" no início da construção são esperados: as imagens são locais.

## Verificado na build 0046

- Versão `v0.35.0 (build 0046)` ativa e sessão preservada.
- `sameNetwork: true` para acesso de casa: o selo "EM CASA" aparece.
- 820 gravações migradas para `<camera>/<AAAA-MM-DD>/HH-MM-SS.mkv`.
- Volume 4: 949 GB no total, 916 GB livres, 31 GB de gravações.
- Taxa real medida antes da migração: ~67 GB/dia em 7 visões. Garagem 17 GB/dia; Outdoor visão 2 12,4 GB; Mi 2K Externa 8,8 GB; AW300 Portão 8,2 GB; Outdoor visão 1 8,0 GB; Mi 2K Sala 6,9 GB; Mi 2K Estúdio 5,9 GB.
- HEVC original reproduz no Chrome do proprietário (AW300 2304×1296, início em ~8–11 s). O tempo-limite antes do modo convertido passou para 25 s na 0047.

## Outdoor Pro: limitação de uma visão por vez

Os logs da ponte mostraram 111 timeouts `probe: miss` na Outdoor (192.168.1.85) em 70 minutos. As demais câmeras ficaram estáveis. Na 0043, a visão 2 gravou 85 arquivos e a visão 1 só 20; na 0046, com conexão ordenada, a visão 1 grava e a visão 2 não conecta. Com uma sessão P2P por visão, a câmera entrega uma visão por vez. O app oficial abre as duas na mesma sessão (o replay usa canais `[0,10]` e `avchannelmerge`, conforme `targets/xiaomi_home/notes/13_plugins_sem_usb.md`).

Na 0047, o gravador prioriza a visão que está funcionando: a outra só tenta de novo após 10 min. O painel avisa quando a visão 2 não abre. **Próxima tarefa:** estender a ponte go2rtc (`targets/xiaomi_home/reconstructed/go2rtc-miss-patch`) para pedir os dois canais na mesma sessão.

## Pendências

- Integração dos veículos no NAS: os clientes GWM/BYD não estão na imagem, e os cartões informam "Sem dados".
- Estratégia de nuvem: decisão do proprietário; por enquanto as gravações ficam só no NAS.

## mkcodezip.py

```python
import hashlib, sys, zipfile
from pathlib import Path
private = Path(sys.argv[1]); build = sys.argv[2]
root = private / f'nas-portal-build-{build}'
compose = (root / 'compose.yaml').read_text(encoding='utf-8').replace(
    'build: {context: ./app, dockerfile: Dockerfile}',
    f'build: {{context: /volume4/HDD 1TB - V2/Mizin-Home/nas-portal-build-{build}/app, dockerfile: Dockerfile}}')
(private / f'compose-volume4-{build}.yaml').write_text(compose, encoding='utf-8')
out = private / f'nas-portal-build-{build}-code.zip'
with zipfile.ZipFile(out, 'x', zipfile.ZIP_DEFLATED) as z:
    def add(name, data):
        info = zipfile.ZipInfo(name); info.create_system = 3; info.external_attr = 0o100600 << 16
        z.writestr(info, data, compress_type=zipfile.ZIP_DEFLATED)
    for p in root.rglob('*'):
        if p.is_file() and p.name != 'go2rtc-linux-amd64':
            add((Path(root.name) / p.relative_to(root)).as_posix(), p.read_bytes())
    add(f'{root.name}/compose-volume4.yaml', compose.encode('utf-8'))
print(out, out.stat().st_size, hashlib.sha256(out.read_bytes()).hexdigest())
```
