'use strict';
const tabs = Array.from(document.querySelectorAll('[data-screen]'));
function selectScreen(tab) {
  for (const item of tabs) {
    const selected = item === tab;
    item.setAttribute('aria-selected', String(selected));
    item.tabIndex = selected ? 0 : -1;
    document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
  }
}
tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectScreen(tab));
  tab.addEventListener('keydown', event => {
    let next;
    if (['ArrowRight', 'ArrowDown'].includes(event.key)) next = (index + 1) % tabs.length;
    if (['ArrowLeft', 'ArrowUp'].includes(event.key)) next = (index + tabs.length - 1) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next !== undefined) { event.preventDefault(); selectScreen(tabs[next]); tabs[next].focus(); }
  });
});

// Site downloads need the password (functions/_middleware.js); the installed plugin never does.
const downloadLink = document.getElementById('download-link');
const accessForm = document.getElementById('download-access');
const accessInput = document.getElementById('download-password');
const accessStatus = document.getElementById('download-access-status');
const PACKAGE = /^CRISPIX-\d+\.\d+\.\d+-build\d{4}-motor-local\.zip$/;
function askPassword(message) {
  accessForm.hidden = false;
  accessStatus.textContent = message;
  accessInput.focus();
}
async function downloadAuthorized() {
  try {
    const response = await fetch('/api/download-access', {cache: 'no-store', credentials: 'same-origin'});
    return response.ok && (await response.json()).authorized === true;
  } catch { return false; }
}
downloadLink.addEventListener('click', async event => {
  event.preventDefault();
  if (await downloadAuthorized()) location.href = downloadLink.getAttribute('href');
  else askPassword('Digite a senha para baixar o plugin.');
});
accessForm.addEventListener('submit', async event => {
  event.preventDefault();
  const password = accessInput.value.trim();
  if (!password) { askPassword('Digite a senha.'); return; }
  accessStatus.textContent = 'Verificando...';
  let response;
  try {
    response = await fetch('/api/download-access', {method: 'POST', credentials: 'same-origin',
      headers: {'Content-Type': 'application/json'}, body: JSON.stringify({password})});
  } catch {
    accessStatus.textContent = 'Não foi possível verificar a senha agora. Tente novamente.';
    return;
  }
  if (response.status === 401) { accessInput.value = ''; askPassword('Senha incorreta.'); return; }
  if (!response.ok) { accessStatus.textContent = 'Download pelo site indisponível no momento.'; return; }
  accessInput.value = '';
  accessForm.hidden = true;
  location.href = downloadLink.getAttribute('href');
});
// Arriving from a protected link without the password: show the form right away.
if (/^\/downloads\/CRISPIX-/.test(new URLSearchParams(location.search).get('next') || '')) askPassword('Digite a senha para baixar o plugin.');

// The published plugin manifest remains authoritative; website edits never change its version.
fetch('latest.json', {cache: 'no-store'}).then(response => {
  if (!response.ok) throw new Error('Manifest unavailable');
  return response.json();
}).then(release => {
  const url = new URL(release.downloadUrl);
  if (!/^v\d+\.\d+\.\d+ \(build \d+\)$/.test(release.version) ||
      url.origin !== 'https://pub-739d5fceaa824a6c8c84e39bb74ec917.r2.dev' ||
      url.pathname !== `/${release.archiveName}` || !PACKAGE.test(release.archiveName || '') || url.search || url.hash ||
      !Number.isFinite(release.archiveBytes) || release.archiveBytes <= 0) throw new Error('Invalid manifest');
  document.getElementById('verAtual').textContent = release.version;
  document.getElementById('download-version').textContent = release.version;
  downloadLink.href = `/downloads/${release.archiveName}`;
  document.getElementById('download-size').textContent = `ZIP · ${(release.archiveBytes / 1e6).toLocaleString('pt-BR', {maximumFractionDigits: 1})} MB · Windows`;
  document.getElementById('release-status').textContent = 'Versão consultada no canal oficial de atualização.';
}).catch(() => {
  document.getElementById('release-status').textContent = 'Canal indisponível no momento. O link acima é do build 0050 já publicado.';
});

// Only approved real pairs belong in comparisons.json. Empty galleries stay out of navigation.
fetch('comparisons.json').then(response => {
  if (!response.ok) throw new Error('Gallery unavailable');
  return response.json();
}).then(async rows => {
  if (!Array.isArray(rows) || !rows.length) return;
  const safeAsset = value => typeof value === 'string' && /^assets\/[a-zA-Z0-9_-]+\.(jpg|jpeg|webp|png)$/.test(value);
  if (rows.length > 12 || rows.some(row => !safeAsset(row.before) || !safeAsset(row.after) ||
      typeof row.title !== 'string' || typeof row.caption !== 'string')) throw new Error('Invalid photo pair');
  const compare = document.getElementById('photo-compare');
  const slider = document.getElementById('comparison-position');
  const choices = document.getElementById('photo-choices');
  const before = document.getElementById('photo-before');
  const after = document.getElementById('photo-after');
  let selection = 0;
  const preload = source => new Promise((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = source;
  });
  function position() {
    compare.style.setProperty('--position', `${slider.value}%`);
    slider.setAttribute('aria-valuetext', `${slider.value}% da imagem antes da edição`);
  }
  async function show(row, button) {
    const token = ++selection;
    const images = await Promise.all([preload(row.before), preload(row.after)]);
    if (token !== selection) return;
    if (images[0].naturalWidth !== images[1].naturalWidth || images[0].naturalHeight !== images[1].naturalHeight) throw new Error('Pair dimensions differ');
    before.src = row.before; after.src = row.after;
    before.alt = `${row.title}: antes da edição`; after.alt = `${row.title}: depois da edição no CRISPIX`;
    compare.style.aspectRatio = `${images[0].naturalWidth} / ${images[0].naturalHeight}`;
    document.getElementById('comparison-caption').textContent = row.caption;
    choices.querySelectorAll('button').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    slider.value = 50; position();
    document.getElementById('comparativo').hidden = false;
    document.querySelectorAll('[data-comparison-link]').forEach(link => { link.hidden = false; });
  }
  const buttons = rows.map(row => {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = row.title;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => show(row, button).catch(() => {
      document.getElementById('comparison-caption').textContent = 'Esta comparação não pôde ser carregada. Escolha outra foto.';
    }));
    choices.append(button); return button;
  });
  slider.addEventListener('input', position);
  // Drag directly over the photo, while touch users can still scroll vertically.
  function drag(event) {
    const bounds = compare.getBoundingClientRect();
    slider.value = Math.round(Math.max(0, Math.min(100, (event.clientX - bounds.left) / bounds.width * 100)));
    position();
  }
  compare.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    compare.setPointerCapture(event.pointerId); drag(event);
  });
  compare.addEventListener('pointermove', event => {
    if (compare.hasPointerCapture(event.pointerId)) drag(event);
  });
  before.draggable = false; after.draggable = false;
  await show(rows[0], buttons[0]);
}).catch(() => { /* An unavailable pair must never become a manufactured result. */ });
