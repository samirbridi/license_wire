const $ = selector => document.querySelector(selector);
let cameras = [], csrf = '', current = null, retryTimer = null, retries = 0, sourceGeneration = 0;
const objects = new Map();
const quality = $('#quality');
quality.value = localStorage.getItem('camera-quality') || 'balanced';
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; setTimeout(() => { $('#toast').hidden = true; }, 4000); }
async function api(path, init = {}) { const response = await fetch(path, { cache: 'no-store', ...init }); if (!response.ok) { if (response.status === 401) showLogin(); throw new Error((await response.json()).error || 'Não foi possível conectar.'); } return response.json(); }
function showLogin() { $('#dashboard').hidden = true; $('#login').hidden = false; }
async function connect(code) { await api('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) }); await load(); }
async function load() {
  try {
    const session = await api('/api/session'); csrf = session.csrf;
    cameras = await api('/api/cameras');
    $('#login').hidden = true; $('#dashboard').hidden = false;
    $('#all-count').textContent = $('#nav-count').textContent = cameras.length;
    render(cameras); refreshStatus();
  } catch (error) { showLogin(); }
}
function render(items) {
  $('#camera-grid').replaceChildren();
  for (const camera of items) {
    const card = document.createElement('article'); card.className = 'camera-card';
    const preview = document.createElement('div'); preview.className = 'camera-preview';
    const placeholder = document.createElement('span'); placeholder.className = 'preview-placeholder'; placeholder.textContent = '◉';
    const label = document.createElement('span'); label.className = 'preview-label'; label.textContent = camera.sd ? 'PRÉVIA · SD' : 'PRÉVIA';
    const play = document.createElement('button'); play.className = 'card-play'; play.textContent = '▶'; play.setAttribute('aria-label', 'Assistir ' + camera.name);
    const state = document.createElement('span'); state.className = 'preview-state'; state.textContent = 'Carregando prévia';
    preview.append(placeholder, label, play, state);
    const body = document.createElement('div'); body.className = 'camera-body';
    const text = document.createElement('div'), title = document.createElement('h2'), family = document.createElement('span');
    title.className = 'camera-name'; title.textContent = camera.name;
    family.className = 'camera-family'; family.textContent = camera.family + (camera.views.length > 1 ? ` · ${camera.views.length} visões` : '');
    text.append(title, family);
    const open = document.createElement('button'); open.className = 'camera-open'; open.textContent = '↗'; open.setAttribute('aria-label', 'Abrir ' + camera.name);
    body.append(text, open); card.append(preview, body); $('#camera-grid').append(card);
    preview.addEventListener('click', () => openCamera(camera)); open.addEventListener('click', () => openCamera(camera));
    fetchSnapshot(camera, preview, state);
  }
}
async function fetchSnapshot(camera, preview, state) {
  try {
    const response = await fetch('/api/snapshot/' + camera.id, { cache: 'no-store', signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error('Prévia indisponível');
    const blob = await response.blob(), object = URL.createObjectURL(blob);
    if (!preview.isConnected) { URL.revokeObjectURL(object); return; }
    if (objects.has(camera.id)) URL.revokeObjectURL(objects.get(camera.id)); objects.set(camera.id, object);
    const image = document.createElement('img'); image.alt = 'Prévia de ' + camera.name; image.src = object; preview.prepend(image);
    state.textContent = 'Prévia atualizada';
  } catch { if (state.isConnected) state.textContent = 'Toque para conectar'; }
}
async function refreshStatus() { try { const state = await api('/api/status'); $('#central-status').classList.toggle('error', !state.bridge); $('#central-status').replaceChildren(); const dot = document.createElement('span'); dot.className = 'pulse-dot'; $('#central-status').append(dot, document.createTextNode(state.bridge ? 'Central conectada' : 'Central sem conexão')); $('#remote-status').textContent = state.remoteConfigured ? 'HTTPS configurado' : 'Em preparação'; $('#pair-device').hidden = !state.pairingAvailable; $('#revoke-remote').hidden = !state.pairingAvailable; } catch {} }
function openCamera(camera) { current = camera; retries = 0; $('#player-title').textContent = camera.name; $('#camera-view').replaceChildren(); for (const view of camera.views) { const option = document.createElement('option'); option.value = view.id; option.textContent = view.label; $('#camera-view').append(option); } $('#view-control').hidden = camera.views.length < 2; if (!$('#player-dialog').open) $('#player-dialog').showModal(); startVideo(); }
function startVideo() {
  clearTimeout(retryTimer); sourceGeneration++; const generation = sourceGeneration;
  $('#player-state').hidden = false; $('#player-state').lastElementChild.textContent = retries ? 'Reconectando à câmera…' : 'Conectando à câmera…';
  $('#playback-state').textContent = 'Preparando vídeo';
  const player = $('#player'); player.pause(); player.removeAttribute('src'); player.load();
  player.src = '/api/video/' + current.id + '?quality=' + quality.value + '&view=' + encodeURIComponent($('#camera-view').value) + '&attempt=' + Date.now(); player.load();
  player.play().catch(() => {});
  retryTimer = setTimeout(() => { if (generation === sourceGeneration && $('#player-dialog').open && player.readyState < 2) retryVideo(); }, 48000);
}
function retryVideo() { clearTimeout(retryTimer); if (!current || !$('#player-dialog').open) return; if (retries >= 2) { $('#player-state').hidden = false; $('#player-state').lastElementChild.textContent = 'A câmera não respondeu. Use Reconectar para tentar novamente.'; $('#playback-state').textContent = 'Conexão interrompida'; return; } retries++; retryTimer = setTimeout(startVideo, 2000); }
function stopVideo() { sourceGeneration++; clearTimeout(retryTimer); const player = $('#player'); player.pause(); player.removeAttribute('src'); player.load(); current = null; }
$('#player').addEventListener('playing', () => { clearTimeout(retryTimer); $('#player-state').hidden = true; $('#playback-state').textContent = '● Vídeo conectado'; });
$('#player').addEventListener('loadedmetadata', () => { const video = $('#player'); $('#player-title').textContent = current ? current.name + ` · ${video.videoWidth}×${video.videoHeight}` : ''; });
$('#player').addEventListener('error', () => { if (current && $('#player-dialog').open) retryVideo(); });
$('#player').addEventListener('ended', () => { if (current && $('#player-dialog').open) retryVideo(); });
$('#close-player').onclick = () => $('#player-dialog').close(); $('#player-dialog').addEventListener('close', stopVideo);
$('#retry-video').onclick = () => { retries = 0; startVideo(); };
quality.onchange = () => { localStorage.setItem('camera-quality', quality.value); if (current) { retries = 0; startVideo(); } };
$('#camera-view').onchange = () => { if (current) { retries = 0; startVideo(); } };
document.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => { document.querySelectorAll('[data-filter]').forEach(other => other.classList.toggle('active', other === button)); render(cameras.filter(camera => button.dataset.filter === 'all' || camera.family === button.dataset.filter)); });
$('#refresh').onclick = () => { const active = document.querySelector('[data-filter].active'); active.click(); toast('Atualizando as prévias disponíveis.'); };
$('#settings').onclick = () => $('#settings-dialog').showModal(); $('#close-settings').onclick = () => $('#settings-dialog').close();
$('#pair-device').onclick = async () => { try { const access = await api('/api/remote-link', { method: 'POST', headers: { 'X-CSRF-Token': csrf } }); $('#remote-link').value = access.url; $('#remote-access').hidden = false; } catch (error) { toast(error.message); } };
$('#copy-remote').onclick = async () => { try { await navigator.clipboard.writeText($('#remote-link').value); toast('Link copiado. Válido por 10 minutos e um único uso.'); } catch { $('#remote-link').select(); } };
$('#revoke-remote').onclick = async () => { try { await api('/api/revoke-remote-sessions', { method: 'POST', headers: { 'X-CSRF-Token': csrf } }); $('#remote-access').hidden = true; toast('Acessos externos desvinculados.'); } catch (error) { toast(error.message); } };
$('#logout').onclick = async () => { await api('/api/logout', { method: 'POST', headers: { 'X-CSRF-Token': csrf } }); $('#settings-dialog').close(); showLogin(); };
$('#login-form').onsubmit = async event => { event.preventDefault(); try { await connect($('#access-code').value); $('#access-code').value = ''; } catch (error) { $('#login-error').textContent = error.message; } };
const bootstrap = new URLSearchParams(location.hash.slice(1)).get('pair');
if (bootstrap) { history.replaceState({}, '', '/'); connect(bootstrap).catch(error => { showLogin(); $('#login-error').textContent = error.message; }); } else load();
api('/api/version').then(version => { $('#version').textContent = version.display; }).catch(() => {});
setInterval(() => { if (!$('#dashboard').hidden) refreshStatus(); }, 30000);
document.addEventListener('visibilitychange', () => { if (document.hidden && $('#player-dialog').open) { stopVideo(); $('#player-dialog').close(); } });
