'use strict';
const $ = id => document.getElementById(id);
let state = { user: null, licenses: [], orders: [] };

const API = '/api';
const api = (path, data, method = 'POST') => {
  const opts = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include' };
  if (data) opts.body = JSON.stringify(data);
  return fetch(API + path, opts).then(async r => {
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json.error || 'Erro na requisição');
    return json;
  });
};

function notify(msg, type = 'info') {
  const el = document.createElement('div');
  el.textContent = msg;
  el.style.cssText = 'position:fixed;top:20px;right:20px;padding:12px 20px;border-radius:8px;color:#fff;z-index:10000;' + (type === 'error' ? 'background:#c0392b' : type === 'success' ? 'background:#27ae60' : 'background:#2980b9');
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

async function loadAccount() {
  try {
    const data = await api('/account', null, 'GET');
    state.user = { email: data.email || '' };
    state.licenses = data.licenses || [];
    state.orders = data.orders || [];
    render();
  } catch (e) {
    state.user = null;
    renderLogin();
  }
}

function render() {
  const content = $('content');
  if (!state.user) {
    content.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:400px;text-align:center">
        <h2>Bem-vindo ao Portal do Usuário</h2>
        <p style="color:#52635d;max-width:500px">Faça login para gerenciar suas licenças.</p>
        <button id="loginBtn" style="margin-top:24px;padding:10px 24px;background:#07594d;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:1rem">Entrar</button>
      </div>
    `;
    $('loginBtn').onclick = () => {
      const email = prompt('E-mail:');
      const password = prompt('Senha:');
      if (email && password) {
        api('/login', { email, password }).then(() => {
          notify('Login efetuado com sucesso', 'success');
          loadAccount();
        }).catch(e => notify('Login falhou: ' + e.message, 'error'));
      }
    };
    return;
  }

  const active = state.licenses.filter(l => l.devices.length > 0);
  const renewable = state.licenses.filter(l => Object.values(l.rights || {}).some(r => r.months > 0));

  content.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-bottom:24px">
      <div class="card" style="padding:20px;border-radius:12px;background:#fff;border:1px solid #cfdad5">
        <div style="font-size:0.875rem;color:#50625b">Total de Licenças</div>
        <div style="font-size:2rem;font-weight:700;color:#07594d">${state.licenses.length}</div>
      </div>
      <div class="card" style="padding:20px;border-radius:12px;background:#fff;border:1px solid #cfdad5">
        <div style="font-size:0.875rem;color:#50625b">Ativas</div>
        <div style="font-size:2rem;font-weight:700;color:#07594d">${active.length}</div>
      </div>
      <div class="card" style="padding:20px;border-radius:12px;background:#fff;border:1px solid #cfdad5">
        <div style="font-size:0.875rem;color:#50625b">Renováveis</div>
        <div style="font-size:2rem;font-weight:700;color:#27ae60">${renewable.length}</div>
      </div>
    </div>

    <h3 style="color:#07594d;font-size:1.25rem">Minhas Licenças</h3>
    ${state.licenses.length === 0 ? '<p style="color:#50625b">Nenhuma licença encontrada.</p>' : state.licenses.map(l => `
      <div class="card" style="padding:16px;border-radius:12px;background:#fff;border:1px solid #cfdad5;margin-bottom:12px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start">
          <div>
            <h3 style="margin:0;font-size:1.1rem">${escapeHtml(plan(l.offer).name)}</h3>
            <div style="font-size:0.875rem;color:#50625b">${l.serial}</div>
          </div>
          <span style="padding:4px 10px;border-radius:20px;font-size:0.7875rem;font-weight:600;${l.devices.length > 0 ? 'background:#e8f5e9;color:#27ae60' : 'background:#fff3e0;color:#e65100'}">${l.devices.length}/${l.seats} vagas</span>
        </div>
        <div style="margin-top:12px">
          <h4 style="margin:0 0 8px 0;font-size:0.9rem">Produtos</h4>
          ${Object.entries(l.rights || {}).map(([id, r]) => {
            const p = product(id);
            return `
              <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e1e8e4;font-size:0.9rem">
                <span>${p ? p.name : id}</span>
                <span>${r.until ? 'Versões até ' + r.until : 'Atualizações sem prazo'}</span>
              </div>
            `;
          }).join('')}
        </div>
        <div style="margin-top:12px">
          <h4 style="margin:0 0 8px 0;font-size:0.9rem">Máquinas Ativas</h4>
          ${l.devices.length === 0 ? '<p style="color:#50625b;font-size:0.9rem">Nenhuma máquina ativada.</p>' : l.devices.map(d => `
            <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e1e8e4;font-size:0.9rem">
              <span>${escapeHtml(d.label)}</span>
              <button onclick="releaseMachine('${l.serial}', '${d.device}')" style="padding:6px 12px;background:#c0392b;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:0.85rem">Liberar</button>
            </div>
          `).join('')}
        </div>
        <div style="margin-top:12px">
          <button onclick="download('${l.serial}','${l.offer}','licensed')" style="padding:10px 20px;background:#07594d;color:#fff;border:none;border-radius:8px;cursor:pointer">Baixar Licenciado (.cwired)</button>
          ${l.devices.length > 0 ? `<button onclick="download('${l.serial}','${l.offer}','demo')" style="padding:10px 20px;background:#50625b;color:#fff;border:none;border-radius:8px;cursor:pointer;margin-left:8px">Baixar Demo</button>` : ''}
        </div>
      </div>
    `).join('')}
    `;

    $('uploadForm').onsubmit = async e => {
      e.preventDefault();
      const form = new FormData();
      form.append('wire', $('wireFile').files[0]);
      form.append('product_id', $('productId').value);
      form.append('release', $('release').value);
      form.append('project_name', $('projectName').value);

      try {
        const resp = await fetch(API + '/submissions/upload', {
          method: 'POST',
          credentials: 'include',
          body: form
        });
        const json = await resp.json();
        if (!resp.ok) throw new Error(json.error || 'Erro no upload');
        notify('Plugin enviado para revisão com sucesso', 'success');
        $('uploadForm').reset();
        await loadSubmissions();
      } catch (e) {
        notify('Erro no envio: ' + e.message, 'error');
      }
    };
}

window.download = async (id, type) => {
  try {
    const resp = await fetch(API + '/submissions/download-' + type, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id })
    });
    if (!resp.ok) {
      const json = await resp.json().catch(() => ({}));
      throw new Error(json.error || 'Erro no download');
    }
    const blob = await resp.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = resp.headers.get('content-disposition')?.match(/filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/)?.[1] || 'plugin.cwired';
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    notify('Download iniciado', 'success');
  } catch (e) {
    notify('Erro no download: ' + e.message, 'error');
  }
};

window.releaseMachine = async (serial, device) => {
  if (!confirm('Tem certeza que deseja liberar esta máquina?')) return;
  try {
    await api('/api/release-machine', { serial, device });
    notify('Máquina liberada com sucesso', 'success');
    loadSubmissions();
  } catch (e) {
    notify('Erro ao liberar máquina: ' + e.message, 'error');
  }
};

async function init() {
  try {
    const user = await api('/account', null, 'GET');
    state.user = user;
    await loadSubmissions();
  } catch (e) {
    state.user = null;
    renderLogin();
  }
}

init();