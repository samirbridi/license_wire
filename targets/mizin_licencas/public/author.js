'use strict';
const $ = id => document.getElementById(id);
let state = { user: null, submissions: [] };

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

async function loadSubmissions() {
  try {
    state.submissions = await api('/submissions', null, 'GET');
    render();
  } catch (e) {
    notify('Erro ao carregar submissões: ' + e.message, 'error');
  }
}

function render() {
  const content = $('content');
  if (!state.user) {
    content.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:400px;text-align:center">
        <h2>Bem-vindo ao Portal do Autor</h2>
        <p style="color:#52635d;max-width:500px">Faça login para enviar projetos Wire e acompanhar suas submissões.</p>
        <button id="loginBtn" style="margin-top:24px;padding:10px 24px;background:#07594d;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:1rem">Entrar</button>
      </div>
    `;
    $('loginBtn').onclick = () => {
      const email = prompt('E-mail:');
      const password = prompt('Senha:');
      if (email && password) {
        api('/login', { email, password }).then(() => {
          notify('Login efetuado com sucesso', 'success');
          location.reload();
        }).catch(e => notify('Login falhou: ' + e.message, 'error'));
      }
    };
    return;
  }

  const pending = state.submissions.filter(s => s.status === 'pending');
  const approved = state.submissions.filter(s => s.status === 'approved');
  const rejected = state.submissions.filter(s => s.status === 'rejected');

  content.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-bottom:24px">
      <div class="card" style="padding:20px;border-radius:12px;background:#fff;border:1px solid #cfdad5">
        <div style="font-size:0.875rem;color:#50625b">Submissões pendentes</div>
        <div style="font-size:2rem;font-weight:700;color:#07594d">${pending.length}</div>
      </div>
      <div class="card" style="padding:20px;border-radius:12px;background:#fff;border:1px solid #cfdad5">
        <div style="font-size:0.875rem;color:#50625b">Aprovadas</div>
        <div style="font-size:2rem;font-weight:700;color:#27ae60">${approved.length}</div>
      </div>
      <div class="card" style="padding:20px;border-radius:12px;background:#fff;border:1px solid #cfdad5">
        <div style="font-size:0.875rem;color:#50625b">Rejeitadas</div>
        <div style="font-size:2rem;font-weight:700;color:#c0392b">${rejected.length}</div>
      </div>
    </div>

    <div style="margin-bottom:24px">
      <h3 style="color:#07594d;font-size:1.25rem">Enviar novo plugin</h3>
      <form id="uploadForm" style="display:grid;grid-template-columns:1fr 1fr auto;gap:16px;align-items:end">
        <div>
          <label style="display:block;margin-bottom:6px;color:#07594d;font-weight:600">Arquivo .wire</label>
          <input type="file" id="wireFile" accept=".wire" required style="width:100%;padding:10px;border:1px solid #cfdad5;border-radius:8px">
        </div>
        <div>
          <label style="display:block;margin-bottom:6px;color:#07594d;font-weight:600">ID do produto</label>
          <input type="text" id="productId" placeholder="ex: meu-plugin" required style="width:100%;padding:10px;border:1px solid #cfdad5;border-radius:8px">
        </div>
        <div>
          <label style="display:block;margin-bottom:6px;color:#07594d;font-weight:600">Release</label>
          <input type="text" id="release" placeholder="v1.0" required style="width:100%;padding:10px;border:1px solid #cfdad5;border-radius:8px">
        </div>
        <div>
          <label style="display:block;margin-bottom:6px;color:#07594d;font-weight:600">Nome do projeto</label>
          <input type="text" id="projectName" placeholder="Nome do plugin" required style="width:100%;padding:10px;border:1px solid #cfdad5;border-radius:8px">
        </div>
        <div style="grid-column:1/-1">
          <button type="submit" style="padding:12px 28px;background:#07594d;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:1rem;font-weight:600">Enviar para revisão</button>
        </div>
      </form>
    </div>

    <h3 style="color:#07594d;font-size:1.25rem;margin-bottom:12px">Minhas submissões</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px">
      ${state.submissions.map(s => `
        <div class="card" style="padding:16px;border-radius:12px;background:#fff;border:1px solid #cfdad5;display:flex;flex-direction:column;gap:12px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start">
            <div>
              <div style="font-weight:600;color:#07594d">${escapeHtml(s.project_name)}</div>
              <div style="font-size:0.875rem;color:#50625b">${s.product_id} · ${s.release}</div>
            </div>
            <span style="padding:4px 10px;border-radius:20px;font-size:0.7875rem;font-weight:600;${s.status === 'approved' ? 'background:#e8f5e9;color:#27ae60' : s.status === 'rejected' ? 'background:#ffebee;color:#c0392b' : 'background:#fff3e0;color:#e65100'}">${s.status === 'pending' ? 'Pendente' : s.status === 'approved' ? 'Aprovado' : 'Rejeitado'}</span>
          </div>
          ${s.status === 'approved' ? `
            <div style="display:flex;gap:8px">
              <button onclick="download('${s.id}', 'licensed')" style="flex:1;padding:10px;background:#07594d;color:#fff;border:none;border-radius:8px;cursor:pointer">Baixar Licenciado</button>
              <button onclick="download('${s.id}', 'demo')" style="flex:1;padding:10px;background:#50625b;color:#fff;border:none;border-radius:8px;cursor:pointer">Baixar Demo</button>
            </div>
          ` : s.status === 'rejected' ? `
            <div style="color:#c0392b;font-size:0.875rem">${escapeHtml(s.rejection_reason || 'Sem motivo informado')}</div>
          ` : ''}
        </div>
      `).join('') || '<p style="color:#50625b">Nenhuma submissão encontrada.</p>'}
    </div>
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

async function init() {
  try {
    const user = await api('/account', null, 'GET');
    state.user = user;
    await loadSubmissions();
  } catch (e) {
    state.user = null;
    render();
  }
}

init();
