import { LivePlayer } from './player.js';
import { RecordingsPanel } from './recordings.js';
import { createIcon, hydrateIcons } from './icons.js';
hydrateIcons();
const $ = selector => document.querySelector(selector);
let cameras = [], csrf = '';
const livePlayer = new LivePlayer();
const recordingsPanel = new RecordingsPanel(api);
const objects = new Map();
function toast(message) { $('#toast').textContent = message; $('#toast').hidden = false; setTimeout(() => { $('#toast').hidden = true; }, 4000); }
async function api(path, init = {}) { const response = await fetch(path, { cache: 'no-store', ...init }); if (!response.ok) { if (response.status === 401) showLogin(); throw new Error((await response.json()).error || 'Não foi possível conectar.'); } return response.json(); }
function showLogin() { $('#settings-dialog').close(); $('#local-access').hidden = true; $('#local-link').value = ''; $('#remote-access').hidden = true; $('#remote-link').value = ''; $('#pair-local').hidden = true; livePlayer.close(); recordingsPanel.close(); for (const value of objects.values()) URL.revokeObjectURL(value); objects.clear(); cameras = []; $('#camera-grid').replaceChildren(); $('#dashboard').hidden = true; $('#login').hidden = false; }
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
  for (const value of objects.values()) URL.revokeObjectURL(value); objects.clear();
  for (const camera of items) {
    const card = document.createElement('article'); card.className = 'camera-card';
    card.classList.toggle('multi-view-card', camera.views.length > 1);
    const previews = document.createElement('div'); previews.className = 'preview-group';
    for (const view of camera.views.slice(0, 2)) {
      const preview = document.createElement('div'); preview.className = 'camera-preview';
      const placeholder = document.createElement('span'); placeholder.className = 'preview-placeholder'; placeholder.append(createIcon('camera'));
      const label = document.createElement('span'); label.className = 'preview-label'; label.textContent = camera.views.length > 1 ? view.label.toUpperCase() : camera.sd ? 'PRÉVIA · LEVE' : 'PRÉVIA';
      const play = document.createElement('button'); play.className = 'card-play'; play.append(createIcon('play')); play.setAttribute('aria-label', 'Assistir ' + camera.name + ' — ' + view.label);
      const state = document.createElement('span'); state.className = 'preview-state'; state.textContent = 'Carregando prévia';
      preview.append(placeholder, label, play, state); previews.append(preview);
      preview.addEventListener('click', () => livePlayer.open(camera, view.id));
      fetchSnapshot(camera, view, preview, state);
    }
    const body = document.createElement('div'); body.className = 'camera-body';
    const text = document.createElement('div'), title = document.createElement('h2'), family = document.createElement('span');
    title.className = 'camera-name'; title.textContent = camera.name;
    family.className = 'camera-family'; family.textContent = camera.family + (camera.views.length > 1 ? ' · Duas visões' : '');
    text.append(title, family);
    const actions = document.createElement('div'); actions.className = 'camera-actions';
    const recordings = document.createElement('button'); recordings.className = 'text-button with-icon'; recordings.append(createIcon('calendar'), document.createTextNode('Gravações')); recordings.setAttribute('aria-label', 'Gravações de ' + camera.name); recordings.onclick = () => recordingsPanel.open(camera);
    const open = document.createElement('button'); open.className = 'camera-open'; open.append(createIcon('open')); open.setAttribute('aria-label', 'Abrir ' + camera.name); open.onclick = () => livePlayer.open(camera);
    actions.append(recordings, open); body.append(text, actions); card.append(previews, body); $('#camera-grid').append(card);
  }
}
async function fetchSnapshot(camera, view, preview, state) {
  try {
    const response = await fetch(`/api/snapshot/${camera.id}?view=${encodeURIComponent(view.id)}`, { cache: 'no-store', signal: AbortSignal.timeout(120000) });
    if (!response.ok) throw new Error('Prévia indisponível');
    const object = URL.createObjectURL(await response.blob()), key = camera.id + ':' + view.id;
    if (!preview.isConnected) { URL.revokeObjectURL(object); return; }
    if (objects.has(key)) URL.revokeObjectURL(objects.get(key)); objects.set(key, object);
    const image = document.createElement('img'); image.alt = `Prévia de ${camera.name} — ${view.label}`; image.src = object; preview.prepend(image);
    state.textContent = 'Prévia atualizada';
  } catch { if (state.isConnected) state.textContent = 'Toque para conectar'; }
}
async function refreshStatus() { try { const state = await api('/api/status'); $('#central-status').classList.toggle('error', !state.bridge); $('#central-status').replaceChildren(); const dot = document.createElement('span'); dot.className = 'pulse-dot'; $('#central-status').append(dot, document.createTextNode(state.bridge ? 'Central conectada' : 'Central sem conexão')); $('#remote-status').textContent = state.remoteConfigured ? 'HTTPS configurado' : 'Em preparação'; $('#pair-local').hidden = !state.localPairingAvailable; $('#pair-device').hidden = !state.pairingAvailable; $('#revoke-remote').hidden = !state.pairingAvailable; } catch {} }
document.querySelectorAll('[data-filter]').forEach(button => button.onclick = () => { document.querySelectorAll('[data-filter]').forEach(other => other.classList.toggle('active', other === button)); render(cameras.filter(camera => button.dataset.filter === 'all' || camera.family === button.dataset.filter)); });
$('#refresh').onclick = () => { const active = document.querySelector('[data-filter].active'); active.click(); toast('Atualizando as prévias disponíveis.'); };
$('#settings').onclick = () => $('#settings-dialog').showModal(); $('#close-settings').onclick = () => $('#settings-dialog').close();
$('#pair-local').onclick = async () => { try { const access = await api('/api/local-link', { method: 'POST', headers: { 'X-CSRF-Token': csrf } }); $('#local-link').value = access.url; $('#local-access').hidden = false; } catch (error) { toast(error.message); } };
$('#copy-local').onclick = async () => { try { await navigator.clipboard.writeText($('#local-link').value); toast('Link local copiado. Válido por 10 minutos e um único uso.'); } catch { $('#local-link').select(); } };
$('#pair-device').onclick = async () => { try { const access = await api('/api/remote-link', { method: 'POST', headers: { 'X-CSRF-Token': csrf } }); $('#remote-link').value = access.url; $('#remote-access').hidden = false; } catch (error) { toast(error.message); } };
$('#copy-remote').onclick = async () => { try { await navigator.clipboard.writeText($('#remote-link').value); toast('Link copiado. Válido por 10 minutos e um único uso.'); } catch { $('#remote-link').select(); } };
$('#revoke-remote').onclick = async () => { try { await api('/api/revoke-remote-sessions', { method: 'POST', headers: { 'X-CSRF-Token': csrf } }); $('#remote-access').hidden = true; toast('Acessos externos desvinculados.'); } catch (error) { toast(error.message); } };
$('#logout').onclick = async () => { await api('/api/logout', { method: 'POST', headers: { 'X-CSRF-Token': csrf } }); $('#settings-dialog').close(); showLogin(); };
$('#login-form').onsubmit = async event => { event.preventDefault(); try { await connect($('#access-code').value); $('#access-code').value = ''; } catch (error) { $('#login-error').textContent = error.message; } };
const bootstrap = new URLSearchParams(location.hash.slice(1)).get('pair');
if (bootstrap) { history.replaceState({}, '', '/'); connect(bootstrap).catch(error => { showLogin(); $('#login-error').textContent = error.message; }); } else load();
api('/api/version').then(version => { $('#version').textContent = version.display; }).catch(() => {});
setInterval(() => { if (!$('#dashboard').hidden) refreshStatus(); }, 30000);


