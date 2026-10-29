// Mizin Home — publicação de uma build no DS425+ pela API do DSM (Container Manager + File Station).
// Executar na aba do DSM já autenticada (via Claude in Chrome: javascript_tool), depois de colocar o
// pacote "nas-portal-build-XXXX-code.zip" (gerado por prepare-nas-package.py --code-only + mkcodezip)
// num <input type=file id="mizinUpload">. Não envia credenciais: usa a sessão do próprio DSM.
// O pacote vem de scripts/make-nas-code-zip.py.
//
//   await mizinDeploy({build:'0047', previous:'0046', zipSha256:'…', composeSha256:'…', previousComposeSha256:'…'})
//   bridgeSha256:'…' quando a build traz uma ponte nova (pacote feito com --with-bridge)
//
// Passos: confere o SHA-256 do zip → envia para /HDD 1TB - V2/Mizin-Home → extrai → copia a ponte go2rtc
// da build anterior (30 MB fora do pacote) ou, com bridgeSha256, confere a ponte nova extraída → confere o compose extraído →
// só substitui o projeto se a configuração ativa for exatamente a da build anterior → "Construir" em segundo
// plano (window.__build acompanha o progresso; o projeto recria os contêineres e preserva data/ e gravações).
window.mizinDeploy = async ({build, previous, zipSha256, composeSha256, previousComposeSha256, bridgeSha256 = '', projectId = '9d574df2-822f-44f9-9918-d31c75409ab7'}) => {
  const token = window.SYNO.SDS.Session.SynoToken, base = '/HDD 1TB - V2/Mizin-Home', sleep = ms => new Promise(r => setTimeout(r, ms));
  const api = async params => { const r = await fetch('/webapi/entry.cgi', {method: 'POST', headers: {'X-SYNO-TOKEN': token, 'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams(params)}); const d = await r.json(); if (!d.success) throw new Error(`${params.api}.${params.method}: ${JSON.stringify(d.error)}`); return d.data; };
  const sha = async data => [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(b => b.toString(16).padStart(2, '0')).join('');
  const wait = async (apiName, version, taskid) => { for (let i = 0; i < 180; i++) { await sleep(1000); const s = await api({api: apiName, method: 'status', version, taskid}); if (s.finished) return s; } throw new Error(apiName + ' sem conclusão'); };
  const file = document.getElementById('mizinUpload')?.files[0];
  if (!file || file.name !== `nas-portal-build-${build}-code.zip`) throw new Error('Pacote da build não selecionado.');
  const bytes = await file.arrayBuffer();
  if (await sha(bytes) !== zipSha256) throw new Error('SHA-256 do pacote não confere.');
  const form = new FormData(); form.append('path', base); form.append('create_parents', 'true'); form.append('overwrite', 'true'); form.append('file', new Blob([bytes]), file.name);
  const up = await fetch('/webapi/entry.cgi?api=SYNO.FileStation.Upload&method=upload&version=2', {method: 'POST', headers: {'X-SYNO-TOKEN': token}, body: form}).then(r => r.json());
  if (!up.success) throw new Error('Envio falhou: ' + JSON.stringify(up.error));
  const ex = await api({api: 'SYNO.FileStation.Extract', method: 'start', version: '2', file_path: `${base}/${file.name}`, dest_folder_path: base, overwrite: 'false', keep_dir: 'true', create_subfolder: 'false'});
  await wait('SYNO.FileStation.Extract', '2', ex.taskid);
  const bridgeDir = 'app/workspace/targets/xiaomi_home/reconstructed/mizin-cameras/bridge';
  const download = path => { const url = new URL('/webapi/entry.cgi', location.origin); url.search = new URLSearchParams({api: 'SYNO.FileStation.Download', version: '2', method: 'download', path, mode: 'open', SynoToken: token}); return fetch(url); };
  if (bridgeSha256) {
    // Package built with --with-bridge: the new bridge came in the zip; confirm what was extracted.
    const extracted = await download(`${base}/nas-portal-build-${build}/${bridgeDir}/go2rtc-linux-amd64`).then(r => r.arrayBuffer());
    if (await sha(extracted) !== bridgeSha256) throw new Error('Ponte extraída não confere.');
  } else {
    const cp = await api({api: 'SYNO.FileStation.CopyMove', method: 'start', version: '3', path: JSON.stringify([`${base}/nas-portal-build-${previous}/${bridgeDir}/go2rtc-linux-amd64`]), dest_folder_path: `${base}/nas-portal-build-${build}/${bridgeDir}`, overwrite: 'false', remove_src: 'false'});
    await wait('SYNO.FileStation.CopyMove', '3', cp.taskid);
  }
  const compose = await download(`${base}/nas-portal-build-${build}/compose-volume4.yaml`).then(r => r.text());
  if (await sha(new TextEncoder().encode(compose)) !== composeSha256) throw new Error('Compose extraído não confere.');
  const current = (await api({api: 'SYNO.Docker.Project', method: 'get', version: '1', id: projectId})).content.replace(/\r\n/g, '\n').trim();
  if (await sha(new TextEncoder().encode(current)) !== previousComposeSha256) throw new Error('A configuração ativa no NAS não é a da build anterior; nada foi alterado.');
  await api({api: 'SYNO.Docker.Project', method: 'update', version: '1', id: projectId, content: compose});
  window.__build = {text: '', done: false, started: Date.now()};
  (async () => { try { const r = await fetch('/webapi/entry.cgi', {method: 'POST', headers: {'X-SYNO-TOKEN': token, 'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({api: 'SYNO.Docker.Project', method: 'build_stream', version: '1', id: projectId})}); const reader = r.body.getReader(), decoder = new TextDecoder(); for (;;) { const {value, done} = await reader.read(); if (done) break; window.__build.text += decoder.decode(value, {stream: true}); } } catch (e) { window.__build.error = String(e); } finally { window.__build.done = true; } })();
  return 'construindo';
};
