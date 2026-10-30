/**
 * Mizin Home — Portal Frontend Logic (v2.0)
 * Inclui:
 * - Detecção de Rede Local vs Acesso Remoto
 * - Monitor de Conectividade & Alerta de Queda de Energia/Internet
 * - Filtro por Cômodos e Sistema de Favoritos (⭐)
 * - Telemetria ao vivo direta nos cards
 */

let devices = [];
let energyData = null;
let currentRoomFilter = 'all';
let isConnected = true;
let failedPings = 0;

let appUiConfig = {
  showGlanceBar: true,
  glanceBadges: [
    { id: 'gb_lights', type: 'lights', name: 'Luzes Acesas', icon: '💡', enabled: true },
    { id: 'gb_gate', type: 'gate', name: 'Portão Garagem', icon: '🔒', enabled: true },
    { id: 'gb_byd', type: 'byd', name: 'Wallbox BYD', icon: '🚗', enabled: true },
    { id: 'gb_ac', type: 'ac', name: 'Ar Mizin', icon: '❄️', enabled: true },
    { id: 'gb_energy', type: 'energy', name: 'Rede CEEE', icon: '⚡', enabled: true }
  ]
};

try {
  const localShow = localStorage.getItem('mizin_show_glance_bar');
  if (localShow !== null) appUiConfig.showGlanceBar = JSON.parse(localShow);
  const localBadges = localStorage.getItem('mizin_glance_badges');
  if (localBadges) appUiConfig.glanceBadges = JSON.parse(localBadges);
} catch (e) {}

// =============================================================
// SINCRONIZAÇÃO DE CONFIGURAÇÃO CENTRALIZADA (SERVIDOR NUVEM & LOCAL)
// =============================================================
async function syncUiConfigFromServer() {
  try {
    const res = await fetch('/api/config/ui');
    if (!res.ok) return;
    const data = await res.json();
    let changed = false;

    if (data.shortcuts && Array.isArray(data.shortcuts)) {
      const current = localStorage.getItem('mizin_custom_shortcuts');
      const incoming = JSON.stringify(data.shortcuts);
      if (current !== incoming) {
        localStorage.setItem('mizin_custom_shortcuts', incoming);
        renderCustomShortcuts();
        changed = true;
      }
    }
    if (data.pinnedDevices && Array.isArray(data.pinnedDevices)) {
      const current = localStorage.getItem('mizin_pinned_devices');
      const incoming = JSON.stringify(data.pinnedDevices);
      if (current !== incoming) {
        localStorage.setItem('mizin_pinned_devices', incoming);
        renderQuickGrid();
        changed = true;
      }
    }
    if (data.favorites && Array.isArray(data.favorites)) {
      const current = localStorage.getItem('mizin_favs');
      const incoming = JSON.stringify(data.favorites);
      if (current !== incoming) {
        localStorage.setItem('mizin_favs', incoming);
        renderQuickGrid();
        changed = true;
      }
    }
    if (data.showGlanceBar !== undefined) {
      appUiConfig.showGlanceBar = data.showGlanceBar;
      localStorage.setItem('mizin_show_glance_bar', JSON.stringify(data.showGlanceBar));
      changed = true;
    }
    if (data.glanceBadges && Array.isArray(data.glanceBadges)) {
      appUiConfig.glanceBadges = data.glanceBadges;
      localStorage.setItem('mizin_glance_badges', JSON.stringify(data.glanceBadges));
      changed = true;
    }
    if (changed) {
      renderGlanceBar();
    }
  } catch (e) {
    // Offline silencioso
  }
}

async function syncSaveUiConfig(partial) {
  try {
    await fetch('/api/config/ui', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(partial)
    });
  } catch (e) {
    console.warn('[-] Erro ao sincronizar com servidor central:', e.message);
  }
}

// Carrega favoritos do LocalStorage / Servidor
function getFavorites() {
  try {
    return JSON.parse(localStorage.getItem('mizin_favs') || '["eb49c5d1977172327aqb1q", "eb6227b63a58b256579aim", "eb786ebb970e6a20ffj0ls", "ebb5f986e16519ef82o3oa"]');
  } catch {
    return [];
  }
}

function toggleFavorite(devId, event) {
  if (event) event.stopPropagation();
  let favs = getFavorites();
  if (favs.includes(devId)) {
    favs = favs.filter(id => id !== devId);
  } else {
    favs.push(devId);
  }
  localStorage.setItem('mizin_favs', JSON.stringify(favs));
  syncSaveUiConfig({ favorites: favs });
  renderQuickGrid();
}

// -------------------------------------------------------------
// -------------------------------------------------------------
// Roteamento Inteligente & Detecção de Rede (Local 1ms vs Remoto)
// -------------------------------------------------------------
const currentHost = window.location.hostname;
const isDirectHost = currentHost === 'localhost' || currentHost === '127.0.0.1' || currentHost.startsWith('192.168.');
let BACKEND_API_BASE = window.MIZIN_PRIVATE_GATEWAY || isDirectHost || currentHost.includes('trycloudflare.com') ? '' : 'https://food-kind-ethernet-down.trycloudflare.com';
let isLocalAccess = isDirectHost;

const origFetch = window.fetch;
window.fetch = function(url, options) {
  if (typeof url === 'string' && url.startsWith('/api/')) {
    if (BACKEND_API_BASE) {
      url = BACKEND_API_BASE + url;
    }
  }
  return origFetch(url, options);
};

async function refreshRemoteTunnelUrl() {
  const host = window.location.hostname;
  if(window.MIZIN_PRIVATE_GATEWAY)return '';
  if (host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.') || host.startsWith('10.') || host.includes('trycloudflare.com')) {
    return BACKEND_API_BASE;
  }
  try {
    const res = await origFetch(`/tunnel.json?t=${Date.now()}`, { cache: 'no-store' });
    if (res.ok) {
      const info = await res.json();
      if (info && info.tunnelUrl && info.tunnelUrl.startsWith('https://')) {
        BACKEND_API_BASE = info.tunnelUrl;
        const remoteInput = document.getElementById('voiceRemoteUrl');
        if (remoteInput) remoteInput.value = `${info.tunnelUrl}/api/webhook/voice`;
      }
    }
  } catch (e) {}
  return BACKEND_API_BASE;
}

async function detectAccessMode() {
  const host = window.location.hostname;
  const isDirect = host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.') || host.startsWith('10.');
  const badge = document.getElementById('accessModeBadge');

  if (isDirect) {
    isLocalAccess = true;
    BACKEND_API_BASE = '';
    if (badge) {
      badge.innerText = '🏠 REDE LOCAL (0ms)';
      badge.className = 'badge badge-mode';
      badge.title = 'Conexão direta na mesma rede local';
    }
    return true;
  }

  isLocalAccess = false;
  BACKEND_API_BASE = window.MIZIN_PRIVATE_GATEWAY || host.includes('trycloudflare.com') ? '' : 'https://food-kind-ethernet-down.trycloudflare.com';
  await refreshRemoteTunnelUrl();
  if (badge) {
    badge.innerText = '🌐 MODO REMOTO (Cloudflare)';
    badge.className = 'badge badge-mode badge-remote';
  }

  if(window.MIZIN_PRIVATE_GATEWAY){
    // Same public IP as the house: the visitor is at home, even though traffic still crosses Cloudflare.
    try{
      const health=await fetch('/api/health',{cache:'no-store'}).then(r=>r.ok?r.json():null);
      if(health?.sameNetwork){
        isLocalAccess=true;
        if(badge){badge.innerText='🏠 EM CASA';badge.className='badge badge-mode';badge.title='Mesma rede da residência; o tráfego segue protegido pelo Cloudflare.';}
        return true;
      }
    }catch{}
    return false;
  }
  // Diagnóstico Inteligente de Rede Local: descobre se o cliente está na mesma LAN que o servidor
  try {
    const healthUrl = `${BACKEND_API_BASE}/api/health?t=${Date.now()}`;
    const res = await fetch(healthUrl, { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data && data.version) {
        const vBadge = document.getElementById('headerVersionBadge');
        if (vBadge) vBadge.innerText = data.version;
      }
      if (data && data.serverLanIp) {
        window._serverLanIp = data.serverLanIp;
        window._serverPort = data.serverPort || 19860;

        // Tenta teste silencioso de 800ms direto para o IP local do servidor
        const probeCtrl = new AbortController();
        const probeTimer = setTimeout(() => probeCtrl.abort(), 800);
        try {
          const lanProbe = await fetch(`http://${data.serverLanIp}:${data.serverPort}/api/health`, {
            mode: 'cors',
            signal: probeCtrl.signal
          });
          clearTimeout(probeTimer);
          if (lanProbe.ok) {
            isLocalAccess = true;
            BACKEND_API_BASE = `http://${data.serverLanIp}:${data.serverPort}`;
            if (badge) {
              badge.innerHTML = `🏠 REDE LOCAL DETECTADA <span style="font-size:9px; opacity:0.8;">(${data.serverLanIp})</span>`;
              badge.className = 'badge badge-mode';
              badge.style.background = 'linear-gradient(135deg, rgba(16, 185, 129, 0.25) 0%, rgba(5, 150, 105, 0.4) 100%)';
              badge.style.borderColor = '#10b981';
              badge.title = 'Você está na mesma rede local! Usando conexão direta de alta velocidade.';
            }
            showToast('Rede Local Detectada!', `Conectado diretamente a ${data.serverLanIp} com velocidade máxima 🚀`, '🏠', 'success');
            return true;
          }
        } catch (probeErr) {
          clearTimeout(probeTimer);
          // Se o navegador bloqueou mixed content (HTTPS para HTTP), exibe atalho de aceleração imediata
          if (badge && data.serverLanIp) {
            badge.innerHTML = `🏠 MESMA REDE <a href="http://${data.serverLanIp}:${data.serverPort}" target="_blank" style="color:#38bdf8; text-decoration:underline; font-weight:700; margin-left:4px;" title="Clique para abrir com velocidade máxima sem Cloudflare">Acelerar 🚀</a>`;
            badge.className = 'badge badge-mode';
          }
        }
      }
    }
  } catch (e) {}

  return false;
}
detectAccessMode();

// -------------------------------------------------------------
// Watchdog de Conexão & Alerta de Queda
// -------------------------------------------------------------
let disconnectedSince = null;

async function checkConnection(isManualRetry = false) {
  const alertEl = document.getElementById('connectionAlert');
  const alertTimerEl = document.getElementById('alertOfflineTimer');
  const statusEl = document.getElementById('systemStatusText');
  const pulseEl = document.getElementById('systemPulse');
  const indicatorEl = document.querySelector('.status-indicator');

  const start = Date.now();
  try {
    let res = await fetch('/api/health?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok && !isLocalAccess) {
      await refreshRemoteTunnelUrl();
      res = await fetch('/api/health?t=' + Date.now(), { cache: 'no-store' });
    }
    if (!res.ok) throw new Error('HTTP ' + res.status);
    
    const latency = window.MIZIN_NETWORK_LATENCY ?? Date.now() - start;
    const pingEl = document.getElementById('pingMs');
    if (pingEl) pingEl.innerText = `~${latency}ms`;

    isConnected = true;
    failedPings = 0;
    disconnectedSince = null;
    if (alertEl) alertEl.classList.remove('active');
    if (statusEl) {
      statusEl.innerHTML = `ONLINE (<span id="pingMs">~${latency}ms</span>) • ${isLocalAccess ? (window.MIZIN_PRIVATE_GATEWAY ? 'EM CASA' : 'REDE LOCAL') : 'MODO REMOTO'}`;
    }
    if (pulseEl) pulseEl.className = 'pulse-dot';
    if (indicatorEl) indicatorEl.className = 'status-indicator';

  } catch (err) {
    if (!isLocalAccess) {
      await refreshRemoteTunnelUrl();
    }
    failedPings++;
    if (failedPings >= 3) {
      isConnected = false;
      if (!disconnectedSince) disconnectedSince = Date.now();
      const elapsedSec = Math.round((Date.now() - disconnectedSince) / 1000);

      if (statusEl) statusEl.innerText = 'DESCONECTADO';
      if (pulseEl) pulseEl.className = 'pulse-dot offline';
      if (indicatorEl) indicatorEl.className = 'status-indicator offline';

      // Dispara aviso visual se estiver em modo externo
      if (alertEl && !isLocalAccess) {
        alertEl.classList.add('active');
        if (alertTimerEl) alertTimerEl.innerText = `Sem sinal há ${elapsedSec}s... Tentando reconectar automaticamente`;
      }
    }
  }
}
setInterval(checkConnection, 4000);

// Relógio ao vivo
function updateClock() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('pt-BR');
  const clockEl = document.getElementById('liveClock');
  if (clockEl) clockEl.innerText = timeStr;
}
setInterval(updateClock, 1000);
updateClock();

// Navegação de Abas (Com Lazy Loading de Câmeras, Logs, Automações e Tendências)
function switchTab(target) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  const btn = document.querySelector(`.tab-btn[data-tab="${target}"]`);
  if (btn) btn.classList.add('active');
  const content = document.getElementById(`tab-${target}`);
  if (content) content.classList.add('active');
  if (target === 'logs') renderLogbook();
  if (target === 'cameras') fetchCameras(); // Lazy load: só busca câmeras ao abrir a aba
  if (target === 'automations') fetchAutomations();
  if (target === 'energy') fetchEnergyTrends();
  if (target === 'ev') fetchEvData();
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    switchTab(btn.dataset.tab);
  });
});

// Suporte a hash e query param para navegação direta de abas
function initTabFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const tabParam = params.get('tab') || window.location.hash.replace('#', '');
  if (tabParam && ['overview', 'cameras', 'energy', 'ev', 'automations', 'devices', 'logs'].includes(tabParam)) {
    switchTab(tabParam);
  }
}
window.addEventListener('DOMContentLoaded', initTabFromUrl);
window.addEventListener('hashchange', initTabFromUrl);
initTabFromUrl();

// Filtro de Cômodos na Visão Geral
document.querySelectorAll('.room-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.room-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentRoomFilter = btn.dataset.room;
    renderQuickGrid();
  });
});

// Ícones SVG
function getDeviceIcon(category) {
  if (category === 'kg' || category === 'interruptor_luzes') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/></svg>`;
  }
  if (category === 'cz' || category === 'tomada_ar' || category === 'tomada_16a') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="4" width="16" height="16" rx="2"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/></svg>`;
  }
  if (category === 'dlq' || category === 'disjuntor_medidor') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>`;
  }
  if (category === 'dj' || category === 'lampada') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>`;
  }
  if (category === 'ckmkzq' || category === 'portao') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11"/></svg>`;
  }
  if (category === 'jtmspro' || category === 'fechadura') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
  }
  if (category === 'wg2' || category === 'gateway' || category === 'hub') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 11a9 9 0 0 1 16 0"/><path d="M7 14a5 5 0 0 1 10 0"/><circle cx="12" cy="18" r="2"/></svg>`;
  }
  if (category === 'ykq' || category === 'remote') {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="2" width="12" height="20" rx="4"/><circle cx="12" cy="8" r="2"/><line x1="9" y1="14" x2="9.01" y2="14"/><line x1="15" y1="14" x2="15.01" y2="14"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>`;
  }
  if (category.includes('infrared')) {
    return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></svg>`;
  }
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
}

// Carrega dados de energia em tempo real e histórico
let currentChartTab = 'daily';

function switchChartTab(tab) {
  currentChartTab = tab;
  document.getElementById('btnChartDaily')?.classList.toggle('active', tab === 'daily');
  document.getElementById('btnChartMonthly')?.classList.toggle('active', tab === 'monthly');
  const title = document.getElementById('chartTitle');
  if (title) title.innerText = tab === 'daily' ? 'Consumo dos Últimos 7 Dias (kWh):' : 'Histórico de Consumo por Mês (kWh):';
  renderEnergyChart();
}

function renderEnergyChart() {
  const chartEl = document.getElementById('energyBarChart');
  if (!chartEl || !energyData || !energyData.history) return;

  if (currentChartTab === 'daily') {
    const daily = energyData.history.daily || [];
    const maxKwh = Math.max(...daily.map(d => d.kwh), 20);
    chartEl.innerHTML = daily.map(d => {
      const pct = Math.round((d.kwh / maxKwh) * 100);
      return `
        <div class="bar-col">
          <div class="bar-fill ${d.active ? 'active' : ''}" style="height: ${pct}%;"></div>
          <span>${d.day}</span>
          <small>${d.kwh}</small>
        </div>
      `;
    }).join('');
  } else {
    const monthly = energyData.history.monthly || [];
    const maxKwh = Math.max(...monthly.map(m => m.kwh), 500);
    chartEl.innerHTML = monthly.map(m => {
      const pct = Math.round((m.kwh / maxKwh) * 100);
      return `
        <div class="bar-col">
          <div class="bar-fill ${m.active ? 'active' : ''}" style="height: ${pct}%;"></div>
          <span>${m.month}</span>
          <small>${m.kwh}</small>
        </div>
      `;
    }).join('');
  }
}

async function fetchEnergy() {
  try {
    const res = await fetch('/api/energy');
    const data = await res.json();
    energyData = data;

    if (data.home) {
      const homeWatts = data.home.totalWatts !== undefined ? data.home.totalWatts : '235';
      const homeAmps = data.home.totalAmperes || '2.37';
      const homeKwh = data.home.totalKwh || '11105.0';
      const homeTemp = data.home.temperature !== undefined ? data.home.temperature : 13;
      const homeTempStatus = data.home.tempStatus || 'Normal (Fios Frios)';
      const homeTempLevel = data.home.tempLevel || 'safe';

      const mHomeWatts = document.getElementById('metricHomeWatts');
      if (mHomeWatts) mHomeWatts.innerText = homeWatts;
      const mHomeAmps = document.getElementById('metricHomeTotalAmps');
      if (mHomeAmps) mHomeAmps.innerText = `${homeAmps} A total`;

      const glancePowerText = document.getElementById('glancePowerText');
      if (glancePowerText) glancePowerText.innerText = `Rede: ${homeWatts} W • ${homeAmps} A`;

      const mHomeTempBadge = document.getElementById('metricHomeTempBadge');
      if (mHomeTempBadge) {
        mHomeTempBadge.innerText = `🌡️ ${homeTemp}°C • ${homeTemp < 45 ? 'Fios Frios' : 'Atenção'}`;
        mHomeTempBadge.className = `badge badge-temp-${homeTempLevel}`;
      }

      const mHomeV = document.getElementById('metricHomeVoltages');
      if (mHomeV) mHomeV.innerText = `${data.home.phaseA}V • ${data.home.phaseB}V • ${data.home.phaseC}V`;
      const mHomeFreq = document.getElementById('metricHomeFreq');
      if (mHomeFreq) mHomeFreq.innerText = `${data.home.frequency}.0 Hz`;
      const mHomeKwh = document.getElementById('metricHomeKwh');
      if (mHomeKwh) mHomeKwh.innerText = `${homeKwh} kWh`;

      const pAVal = document.getElementById('phaseAVal');
      if (pAVal) pAVal.innerText = `${data.home.phaseA} V`;
      const pASub = document.getElementById('phaseASub');
      if (pASub) pASub.innerText = `${data.home.phaseA_A || '1.25'} A • ${data.home.phaseA_W || '120'} W`;

      const pBVal = document.getElementById('phaseBVal');
      if (pBVal) pBVal.innerText = `${data.home.phaseB} V`;
      const pBSub = document.getElementById('phaseBSub');
      if (pBSub) pBSub.innerText = `${data.home.phaseB_A || '1.05'} A • ${data.home.phaseB_W || '86'} W`;

      const pCVal = document.getElementById('phaseCVal');
      if (pCVal) pCVal.innerText = `${data.home.phaseC} V`;
      const pCSub = document.getElementById('phaseCSub');
      if (pCSub) pCSub.innerText = `${data.home.phaseC_A || '0.08'} A • ${data.home.phaseC_W || '5'} W`;

      const pFVal = document.getElementById('phaseFreqVal');
      if (pFVal) pFVal.innerText = `${data.home.frequency}.0 Hz`;
      const pPfSub = document.getElementById('phasePfSub');
      if (pPfSub) pPfSub.innerText = `Fator Potência: ${data.home.powerFactor || '0.72'}`;

      const pTempVal = document.getElementById('phaseTempVal');
      if (pTempVal) pTempVal.innerText = `${homeTemp} °C`;
      const pTempSub = document.getElementById('phaseTempSub');
      if (pTempSub) pTempSub.innerText = `🌡️ ${homeTempStatus}`;

      const eHKwh = document.getElementById('energyHomeKwhTotal');
      if (eHKwh) eHKwh.innerText = `${homeKwh} kWh`;
      const eHW = document.getElementById('energyHomeWattsTotal');
      if (eHW) eHW.innerText = `${homeWatts} W`;
      const eHA = document.getElementById('energyHomeAmpsTotal');
      if (eHA) eHA.innerText = `${homeAmps} A`;
      const eHTemp = document.getElementById('energyHomeTempFooter');
      if (eHTemp) eHTemp.innerText = `${homeTemp} °C`;
    }

    // Telemetria do Gerador
    if (data.generator) {
      const g = data.generator;
      const gWatts = g.watts || 0;
      const gAmps = g.amperes || '0.00';
      const gKwh = g.totalKwh || '18.21';
      const gFreq = g.frequency || '0.0';
      const isRunning = g.isRunning;

      const mGenW = document.getElementById('metricGenWatts');
      if (mGenW) mGenW.innerText = gWatts;
      const mGenA = document.getElementById('metricGenTotalAmps');
      if (mGenA) mGenA.innerText = `${gAmps} A`;

      const genBadge = document.getElementById('genStateBadge');
      if (genBadge) {
        genBadge.innerText = isRunning ? 'EM OPERAÇÃO' : 'STANDBY (CEEE)';
        genBadge.className = isRunning ? 'badge badge-live' : 'badge badge-neutral';
      }

      const mGenSource = document.getElementById('metricGenSource');
      if (mGenSource) mGenSource.innerText = data.home?.activeSource === 'GERADOR' ? 'GERADOR RESIDENCIAL' : 'Concessionária CEEE Ativa';
      const mGenFreq = document.getElementById('metricGenFreq');
      if (mGenFreq) mGenFreq.innerText = `${gFreq} Hz`;
      const mGenK = document.getElementById('metricGenKwh');
      if (mGenK) mGenK.innerText = `${gKwh} kWh (Isento)`;

      // Na aba 3
      const gVVal = document.getElementById('genVoltageVal');
      if (gVVal) gVVal.innerText = `${g.volts} V`;
      const gCVal = document.getElementById('genCurrentVal');
      if (gCVal) gCVal.innerText = `${gAmps} A`;
      const gCSub = document.getElementById('genCurrentSub');
      if (gCSub) gCSub.innerText = isRunning ? 'Injetando corrente' : 'Motor desligado';

      const gWVal = document.getElementById('genWattsVal');
      if (gWVal) gWVal.innerText = `${gWatts} W`;
      const gWSub = document.getElementById('genWattsSub');
      if (gWSub) gWSub.innerText = isRunning ? 'Geração ativa' : 'Sem injeção';

      const gTKwh = document.getElementById('genTotalKwh');
      if (gTKwh) gTKwh.innerText = `${gKwh} kWh`;

      const gFVal = document.getElementById('genFreqVal');
      if (gFVal) gFVal.innerText = `${gFreq} Hz`;

      const gTabBadge = document.getElementById('genTabStatusBadge');
      if (gTabBadge) {
        gTabBadge.innerText = g.statusLabel || (isRunning ? 'EM OPERAÇÃO' : 'STANDBY (CEEE ATIVA)');
        gTabBadge.className = isRunning ? 'badge badge-live' : 'badge badge-neutral';
      }

      const gSourceText = document.getElementById('genSourceText');
      if (gSourceText) gSourceText.innerText = data.home?.activeSource === 'GERADOR' ? 'GERADOR RESIDENCIAL' : 'CONCESSIONÁRIA CEEE';
    }

    if (data.byd) {
      const bydV = data.byd.volts || '216.4';
      const bydA = data.byd.amperesFormatted || `${data.byd.amperes || '0.040'} A`;
      const bydMa = data.byd.milliAmperesFormatted || '40 mA';
      const bydWatts = data.byd.watts !== undefined ? data.byd.watts : '2';
      const bydKw = data.byd.kwFormatted || '0,002 kW';
      const bydFreq = data.byd.frequency || '60.2';
      const isCharging = parseInt(bydWatts) > 100;

      const mBydW = document.getElementById('metricBydWatts');
      if (mBydW) mBydW.innerText = bydWatts;
      const mBydKw = document.getElementById('metricBydKw');
      if (mBydKw) mBydKw.innerText = `(${bydKw})`;
      const mBydA = document.getElementById('metricBydAmps');
      if (mBydA) mBydA.innerText = `${bydA} (${bydMa})`;

      const mBydDet = document.getElementById('metricBydDetails');
      if (mBydDet) mBydDet.innerText = `${bydV}V Bifásica • ${bydFreq} Hz`;
      const mBydK = document.getElementById('metricBydKwh');
      if (mBydK) mBydK.innerText = `${data.byd.totalKwh} kWh`;

      const bVVal = document.getElementById('bydVoltageVal');
      if (bVVal) bVVal.innerText = `${bydV} V`;
      const bFreqSub = document.getElementById('bydFreqSub');
      if (bFreqSub) bFreqSub.innerText = `${bydFreq} Hz • 220V Bifásica`;

      const bCVal = document.getElementById('bydCurrentVal');
      if (bCVal) bCVal.innerText = bydA;
      const bCSub = document.getElementById('bydCurrentSub');
      if (bCSub) bCSub.innerText = `${bydMa} • Standby`;

      const bWVal = document.getElementById('bydWattsVal');
      if (bWVal) bWVal.innerText = `${bydWatts} W`;
      const bKwSub = document.getElementById('bydKwSub');
      if (bKwSub) bKwSub.innerText = `${bydKw} (Standby)`;

      const bTKwh = document.getElementById('bydTotalKwh');
      if (bTKwh) bTKwh.innerText = `${data.byd.totalKwh} kWh`;
      const bTCostSub = document.getElementById('bydTotalCostSub');
      if (bTCostSub) bTCostSub.innerText = `Custo Total: ~R$ ${data.byd.totalCost || '2.380'}`;

      const bMonthK = document.getElementById('bydMonthKwhVal');
      if (bMonthK) bMonthK.innerText = `${data.byd.monthKwh || '110.0'} kWh`;
      const bMonthC = document.getElementById('bydMonthCostSub');
      if (bMonthC) bMonthC.innerText = `Custo: ~R$ ${data.byd.monthCost || '113,72'}`;

      const breakerText = document.getElementById('bydBreakerStateText');
      if (breakerText) breakerText.innerText = data.byd.breakerState ? 'ARMADO (LIGADO)' : 'DESARMADO';

      const statusBadge = document.getElementById('bydStatusBadge');
      if (statusBadge) {
        if (!data.byd.breakerState) {
          statusBadge.innerText = 'DESARMADO';
          statusBadge.className = 'badge badge-neutral';
        } else if (isCharging) {
          statusBadge.innerText = `⚡ CARREGANDO (${bydWatts}W • ${bydA})`;
          statusBadge.className = 'badge badge-live';
        } else {
          statusBadge.innerText = 'ARMADO (STANDBY)';
          statusBadge.className = 'badge badge-emerald';
        }
      }

      const topBadge = document.getElementById('bydBreakerBadge');
      if (topBadge) {
        if (!data.byd.breakerState) {
          topBadge.innerText = 'DESLIGADO';
          topBadge.className = 'badge badge-neutral';
        } else if (isCharging) {
          topBadge.innerText = 'CARREGANDO';
          topBadge.className = 'badge badge-live';
        } else {
          topBadge.innerText = 'STANDBY';
          topBadge.className = 'badge badge-emerald';
        }
      }

      const toggleBtn = document.getElementById('btnToggleBydBreaker');
      if (toggleBtn) {
        toggleBtn.innerText = data.byd.breakerState ? 'Desarmar Disjuntor BYD' : 'Armar Disjuntor BYD';
      }
    }

    // Atualiza cards de relatório de consumo com dados da tarifa CEEE
    if (data.history) {
      const h = data.history;

      const rTariff = document.getElementById('reportTariffDisplay');
      if (rTariff) rTariff.innerText = `R$ ${h.rateKwh ? Number(h.rateKwh).toFixed(4) : '1,0338'} / kWh efetivo`;
      const rConc = document.getElementById('reportConcessionariaDisplay');
      if (rConc) rConc.innerText = h.concessionaria || 'CEEE Equatorial (RS)';
      const rClose = document.getElementById('reportClosingDayDisplay');
      if (rClose) rClose.innerText = h.closingDay || '18';

      const rDayK = document.getElementById('reportDailyKwh');
      if (rDayK) rDayK.innerText = `${h.todayKwh} kWh`;
      const rDayC = document.getElementById('reportDailyCost');
      if (rDayC) rDayC.innerText = `~R$ ${h.todayCost}`;

      const rMonthK = document.getElementById('reportMonthKwh');
      if (rMonthK) rMonthK.innerText = `${h.lastBillKwh || 1112} kWh`;
      const rMonthC = document.getElementById('reportMonthCost');
      if (rMonthC) {
        rMonthC.innerHTML = `R$ ${h.lastBillTotalReais ? Number(h.lastBillTotalReais).toFixed(2).replace('.', ',') : '1.149,61'} <small style="display:block; font-size:10px; color:var(--accent-emerald); font-weight:normal; margin-top:2px;">Fatura CEEE Paga (Conta Real)</small>`;
      }

      const rBydMonthK = document.getElementById('reportBydMonthKwh');
      if (rBydMonthK) rBydMonthK.innerText = `${h.bydMonthKwh || 285} kWh`;
      const rBydMonthC = document.getElementById('reportBydMonthCost');
      if (rBydMonthC) rBydMonthC.innerText = `~R$ ${h.bydMonthCost || '294,63'} no Carro`;

      const rBydK = document.getElementById('reportBydKwh');
      if (rBydK) rBydK.innerText = `${h.bydTotalKwh} kWh`;
      const rBydE = document.getElementById('reportBydEconomy');
      if (rBydE) rBydE.innerText = `Economia: ~R$ ${h.bydEconomyReais || '5.915'} vs Gasolina`;

      renderEnergyChart();
      renderComparativeTables(h);
    }
    renderGlanceBar();
  } catch (err) {
    console.error('Erro ao buscar energia:', err);
  }
}

// Modal de Telemetria e Mais Opções (Estilo Home Assistant More-Info)
function openEnergyDetailsModal(target) {
  const modal = document.getElementById('energyDetailsModal');
  if (!modal || !energyData) return;

  const titleEl = document.getElementById('energyModalTitle');
  const subEl = document.getElementById('energyModalSub');
  const iconEl = document.getElementById('energyModalIcon');
  const badgeEl = document.getElementById('energyModalStatusBadge');
  const gaugesEl = document.getElementById('energyModalGauges');
  const actionsEl = document.getElementById('energyModalActions');
  const dpsTableEl = document.getElementById('energyModalDpsTable');

  if (target === 'home') {
    const h = energyData.home;
    const raw = energyData.rawDps?.home || {};
    titleEl.innerText = 'Rede Geral da Casa (Trifásico)';
    subEl.innerText = '192.168.1.92 • Medidor Kowsi KWS-306WF • Concessionária CEEE';
    iconEl.innerText = '⚡';
    iconEl.style.background = 'rgba(56, 189, 248, 0.15)';
    iconEl.style.color = 'var(--accent-cyan)';
    badgeEl.innerText = 'AO VIVO • CEEE ATIVA';
    badgeEl.className = 'badge badge-live';

    gaugesEl.innerHTML = `
      <div class="gauge-tile">
        <span class="gauge-tile-label">POTÊNCIA ATIVA TOTAL</span>
        <div class="gauge-tile-val text-emerald">${h.totalWatts} W</div>
        <span class="gauge-tile-sub">Soma das 3 Fases</span>
      </div>
      <div class="gauge-tile">
        <span class="gauge-tile-label">CORRENTE TOTAL</span>
        <div class="gauge-tile-val text-cyan">${h.totalAmperes || '2.37'} A</div>
        <span class="gauge-tile-sub">Amperagem combinada</span>
      </div>
      <div class="gauge-tile">
        <span class="gauge-tile-label">ENERGIA TOTAL</span>
        <div class="gauge-tile-val">${h.totalKwh} kWh</div>
        <span class="gauge-tile-sub">Acumulado Kowsi</span>
      </div>
      <div class="gauge-tile">
        <span class="gauge-tile-label">FREQUÊNCIA REDE</span>
        <div class="gauge-tile-val">${h.frequency}.0 Hz</div>
        <span class="gauge-tile-sub">Fator Potência: ${h.powerFactor || '0.72'}</span>
      </div>

      <!-- Fases A, B, C Detalhadas -->
      <div class="gauge-tile">
        <span class="gauge-tile-label">FASE A (L1)</span>
        <div class="gauge-tile-val">${h.phaseA} V</div>
        <span class="gauge-tile-sub">${h.phaseA_A} A • ${h.phaseA_W} W • ${h.phaseA_Kwh || '4991.7'} kWh</span>
      </div>
      <div class="gauge-tile">
        <span class="gauge-tile-label">FASE B (L2)</span>
        <div class="gauge-tile-val">${h.phaseB} V</div>
        <span class="gauge-tile-sub">${h.phaseB_A} A • ${h.phaseB_W} W • ${h.phaseB_Kwh || '4579.0'} kWh</span>
      </div>
      <div class="gauge-tile">
        <span class="gauge-tile-label">FASE C (L3)</span>
        <div class="gauge-tile-val">${h.phaseC} V</div>
        <span class="gauge-tile-sub">${h.phaseC_A} A • ${h.phaseC_W} W • ${h.phaseC_Kwh || '1534.4'} kWh</span>
      </div>
      <div class="gauge-tile">
        <span class="gauge-tile-label">TEMPERATURA QUADRO</span>
        <div class="gauge-tile-val text-emerald">${h.temperature} °C</div>
        <span class="gauge-tile-sub">🌡️ ${h.tempStatus} (DPS 108)</span>
      </div>
      <div class="gauge-tile">
        <span class="gauge-tile-label">CONCESSIONÁRIA</span>
        <div class="gauge-tile-val" style="font-size:15px; color:var(--accent-emerald);">CEEE Equatorial</div>
        <span class="gauge-tile-sub">Tarifa Efetiva: R$ ${energyData.history?.rateKwh ? Number(energyData.history.rateKwh).toFixed(4) : '1,0338'}/kWh</span>
      </div>
    `;

    actionsEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 12px 16px; border-radius: var(--radius-sm); border: 1px solid var(--border); flex-wrap: wrap; gap: 8px;">
        <div>
          <div style="font-size: 13px; font-weight: 600;">Status do Medidor Geral & Proteção Térmica</div>
          <div style="font-size: 11px; color: var(--text-muted);">Comunicação direta via protocolo Tuya TCP 6668 local • Sensor NTC ${h.temperature}°C</div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-sm btn-primary" onclick="fetchEnergy(); showToast('Telemetria Atualizada', 'Dados elétricos recarregados via TCP 6668', '⚡', 'info');">Atualizar Agora</button>
          <button class="btn btn-sm btn-outline-cyan" onclick="closeEnergyDetailsModal(); openTariffConfigModal();">Configurar Tarifa</button>
        </div>
      </div>
    `;

    // Render DPS Table
    dpsTableEl.innerHTML = Object.entries(raw).map(([k, v]) => {
      let desc = 'Telemetria Interna';
      let formatted = String(v);
      if (k === '1') { desc = 'Energia Total Acumulada'; formatted = (v / 100).toFixed(2) + ' kWh'; }
      else if (k === '16') { desc = 'Relé / Estado Ativo'; formatted = v ? 'Ligado' : 'Desligado'; }
      else if (k === '101') { desc = 'Fator de Potência Global (cos φ)'; formatted = (v / 100).toFixed(2); }
      else if (k === '102') { desc = 'Energia Acumulada Fase A'; formatted = (v / 100).toFixed(2) + ' kWh'; }
      else if (k === '104') { desc = 'Energia Acumulada Fase B'; formatted = (v / 100).toFixed(2) + ' kWh'; }
      else if (k === '105' || k === '106') { desc = 'Energia Acumulada Fase C'; formatted = (v / 100).toFixed(2) + ' kWh'; }
      else if (k === '107') { desc = 'Frequência da Rede'; formatted = v + ' Hz'; }
      else if (k === '108') { desc = 'Sensor de Temperatura da Caixa (NTC)'; formatted = v + ' °C (Normal)'; }
      else if (k === '115') { desc = 'Limite Proteção Térmica (Alarme)'; formatted = v + ' °C'; }
      else if (k === '125') { desc = 'Tensão Fase A (RMS)'; formatted = (v / 100).toFixed(2) + ' V'; }
      else if (k === '126') { desc = 'Corrente Fase A'; formatted = (v / 1000).toFixed(3) + ' A'; }
      else if (k === '127') { desc = 'Potência Ativa Fase A'; formatted = v + ' W'; }
      else if (k === '128') { desc = 'Tensão Fase B (RMS)'; formatted = (v / 100).toFixed(2) + ' V'; }
      else if (k === '129') { desc = 'Corrente Fase B'; formatted = (v / 1000).toFixed(3) + ' A'; }
      else if (k === '130') { desc = 'Potência Ativa Fase B'; formatted = v + ' W'; }
      else if (k === '131') { desc = 'Tensão Fase C (RMS)'; formatted = (v / 100).toFixed(2) + ' V'; }
      else if (k === '132') { desc = 'Corrente Fase C'; formatted = (v / 1000).toFixed(3) + ' A'; }
      else if (k === '133') { desc = 'Potência Ativa Fase C'; formatted = v + ' W'; }
      else if (k === '135') { desc = 'Potência Ativa Total da Residência'; formatted = v + ' W'; }

      return `
        <tr>
          <td><span class="dps-code-pill">DPS ${k}</span></td>
          <td>${desc}</td>
          <td style="font-family: var(--font-mono); color: var(--text-dim);">${v}</td>
          <td style="font-family: var(--font-mono); color: var(--accent-emerald); font-weight: 600;">${formatted}</td>
        </tr>
      `;
    }).join('');

  } else if (target === 'byd') {
    const b = energyData.byd;
    const raw = energyData.rawDps?.byd || {};
    titleEl.innerText = 'Wallbox Carro Elétrico (BYD)';
    subEl.innerText = '192.168.1.112 • TOMZN TOMPD-63SW DIN 63A • Circuito 220V Bifásico';
    iconEl.innerText = '🔌';
    iconEl.style.background = 'rgba(16, 185, 129, 0.15)';
    iconEl.style.color = 'var(--accent-emerald)';
    badgeEl.innerText = b.breakerState ? (b.isCharging ? '⚡ CARREGANDO' : 'ARMADO (STANDBY)') : 'DESARMADO';
    badgeEl.className = b.breakerState ? (b.isCharging ? 'badge badge-live' : 'badge badge-emerald') : 'badge badge-neutral';

    gaugesEl.innerHTML = `
      <div class="gauge-tile">
        <span class="gauge-tile-label">POTÊNCIA ATIVA</span>
        <div class="gauge-tile-val ${b.isCharging ? 'text-cyan' : 'text-emerald'}">${b.watts} W <small style="font-size:12px; color:var(--text-muted);">(${b.kwFormatted || '0,002 kW'})</small></div>
        <span class="gauge-tile-sub">${b.isCharging ? 'Recarga em andamento' : 'Standby da Wallbox'}</span>
      </div>
      <div class="gauge-tile">
        <span class="gauge-tile-label">CORRENTE</span>
        <div class="gauge-tile-val">${b.amperesFormatted || b.amperes + ' A'} <small style="font-size:12px; color:var(--text-muted);">(${b.milliAmperesFormatted || '40 mA'})</small></div>
        <span class="gauge-tile-sub">Circuito 220V Bifásico</span>
      </div>
      <div class="gauge-tile">
        <span class="gauge-tile-label">TENSÃO BIFÁSICA</span>
        <div class="gauge-tile-val">${b.volts} V</div>
        <span class="gauge-tile-sub">Fase-Fase 220V</span>
      </div>
      <div class="gauge-tile">
        <span class="gauge-tile-label">FREQUÊNCIA DA REDE</span>
        <div class="gauge-tile-val">${b.frequency || '60.2'} Hz</div>
        <span class="gauge-tile-sub">DPS 105 (0.1 Hz)</span>
      </div>
      <div class="gauge-tile">
        <span class="gauge-tile-label">ENERGIA TOTAL</span>
        <div class="gauge-tile-val">${b.totalKwh} kWh</div>
        <span class="gauge-tile-sub">Custo Total: ~R$ ${b.totalCost || '2.380'}</span>
      </div>
      <div class="gauge-tile">
        <span class="gauge-tile-label">ECONOMIA ESTIMADA</span>
        <div class="gauge-tile-val text-emerald" style="font-size:16px;">~R$ ${energyData.history?.bydEconomyReais || '5.915,00'}</div>
        <span class="gauge-tile-sub">vs Abastecimento Gasolina</span>
      </div>
    `;

    actionsEl.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(255,255,255,0.03); padding: 12px 16px; border-radius: var(--radius-sm); border: 1px solid var(--border); flex-wrap: wrap; gap: 10px;">
        <div>
          <div style="font-size: 13px; font-weight: 600;">Controle do Disjuntor Wallbox</div>
          <div style="font-size: 11px; color: var(--text-muted);">Corta ou energiza a alimentação do carregador veicular</div>
        </div>
        <div style="display: flex; gap: 8px;">
          <button class="btn btn-sm ${b.breakerState ? 'btn-neutral' : 'btn-primary'}" onclick="toggleBydBreaker()">${b.breakerState ? 'Desarmar Disjuntor' : 'Armar Disjuntor'}</button>
          <button class="btn btn-sm btn-outline-cyan" onclick="closeEnergyDetailsModal(); openTimerForByd();">⏱️ Agendar Auto-Desligamento</button>
        </div>
      </div>
    `;

    // Render DPS Table
    dpsTableEl.innerHTML = Object.entries(raw).map(([k, v]) => {
      let desc = 'Parâmetro DIN';
      let formatted = String(v);
      if (k === '1') { desc = 'Energia Total Acumulada'; formatted = (v / 100).toFixed(2) + ' kWh'; }
      else if (k === '11') { desc = 'Alarme de Trip / Falha'; formatted = v ? '🚨 FALHA DETECTADA' : 'Normal (Sem Falha)'; }
      else if (k === '16') { desc = 'Estado do Relé / Disjuntor DIN'; formatted = v ? 'Armado (Ligado)' : 'Desarmado'; }
      else if (k === '104') { desc = 'Proteção de Sobretensão'; formatted = v + ' V'; }
      else if (k === '105') { desc = 'Frequência da Rede (0.1 Hz)'; formatted = (v / 10).toFixed(1) + ' Hz'; }
      else if (k === '116') { desc = 'Tensão da Rede RMS'; formatted = (v / 10).toFixed(1) + ' V'; }
      else if (k === '117') { desc = 'Corrente de Carga'; formatted = (v / 1000).toFixed(3) + ' A (' + v + ' mA)'; }
      else if (k === '118') { desc = 'Potência Ativa Medida'; formatted = v + ' W (' + (v / 1000).toFixed(3) + ' kW)'; }

      return `
        <tr>
          <td><span class="dps-code-pill">DPS ${k}</span></td>
          <td>${desc}</td>
          <td style="font-family: var(--font-mono); color: var(--text-dim);">${v}</td>
          <td style="font-family: var(--font-mono); color: var(--accent-emerald); font-weight: 600;">${formatted}</td>
        </tr>
      `;
    }).join('');

  } else if (target === 'generator') {
    const g = energyData.generator;
    const raw = energyData.rawDps?.generator || {};
    titleEl.innerText = 'Wattímetro do Gerador Residencial';
    subEl.innerText = '192.168.1.119 • TOMZN Breaker DIN • Linha de Emergência';
    iconEl.innerText = '⚙️';
    iconEl.style.background = 'rgba(245, 158, 11, 0.15)';
    iconEl.style.color = 'var(--accent-amber)';
    badgeEl.innerText = g.statusLabel;
    badgeEl.className = g.isRunning ? 'badge badge-live' : 'badge badge-neutral';

    gaugesEl.innerHTML = `
      <div class="gauge-tile">
        <span class="gauge-tile-label">STATUS DO GERADOR</span>
        <div class="gauge-tile-val" style="font-size:15px; color:${g.isRunning ? 'var(--accent-emerald)' : 'var(--text-muted)'};">${g.isRunning ? '🟢 Em Operação' : '⚪ Standby (Desligado)'}</div>
        <span class="gauge-tile-sub">${g.isRunning ? 'Gerando energia ativa' : 'Aguardando partida'}</span>
      </div>
      <div class="gauge-tile">
        <span class="gauge-tile-label">POTÊNCIA ATIVA</span>
        <div class="gauge-tile-val text-amber">${g.watts} W</div>
        <span class="gauge-tile-sub">Injeção no quadro</span>
      </div>
      <div class="gauge-tile">
        <span class="gauge-tile-label">TENSÃO DE SAÍDA</span>
        <div class="gauge-tile-val">${g.volts} V</div>
        <span class="gauge-tile-sub">Rede 220V Alternador</span>
      </div>
      <div class="gauge-tile">
        <span class="gauge-tile-label">FREQUÊNCIA ALTERNADOR</span>
        <div class="gauge-tile-val">${g.frequency || '0.0'} Hz</div>
        <span class="gauge-tile-sub">${g.isRunning ? 'Frequência do Gerador' : 'Standby (Sem Rotação)'}</span>
      </div>
      <div class="gauge-tile">
        <span class="gauge-tile-label">ENERGIA TOTAL GERADA</span>
        <div class="gauge-tile-val">${g.totalKwh} kWh</div>
        <span class="gauge-tile-sub">Histórico acumulado</span>
      </div>
      <div class="gauge-tile">
        <span class="gauge-tile-label">CUSTO NA FATURA CEEE</span>
        <div class="gauge-tile-val" style="font-size:15px; color:var(--text-main);">R$ 0,00 (Isento)</div>
        <span class="gauge-tile-sub">Geração Própria Autônoma</span>
      </div>
    `;

    actionsEl.innerHTML = `
      <div style="background: rgba(255,255,255,0.03); padding: 12px 16px; border-radius: var(--radius-sm); border: 1px solid var(--border);">
        <div style="font-size: 13px; font-weight: 600; color: var(--accent-amber);">Modo Standby Inteligente</div>
        <div style="font-size: 11px; color: var(--text-muted); margin-top: 4px; line-height: 1.4;">
          O medidor inteligente do gerador é alimentado pelo circuito de saída do alternador. Quando o gerador estiver desligado, o sistema reporta <strong>Standby Seguro</strong> utilizando energia da concessionária CEEE. Ao dar a partida no motor, a telemetria sincroniza automaticamente em tempo real na porta 192.168.1.119 e o custo financeiro é mantido isento da fatura da CEEE!
        </div>
      </div>
    `;

    // Render DPS Table
    dpsTableEl.innerHTML = Object.keys(raw).length > 0 ? Object.entries(raw).map(([k, v]) => `
      <tr>
        <td><span class="dps-code-pill">DPS ${k}</span></td>
        <td>Parâmetro do Gerador</td>
        <td style="font-family: var(--font-mono); color: var(--text-dim);">${v}</td>
        <td style="font-family: var(--font-mono); color: var(--accent-emerald); font-weight: 600;">${v}</td>
      </tr>
    `).join('') : `
      <tr>
        <td colspan="4" style="text-align:center; color:var(--text-dim); padding:16px;">
          O gerador está em Standby (desligado). Ligue o gerador para visualizar a transmissão ao vivo de DPS.
        </td>
      </tr>
    `;
  }

  modal.classList.add('active');
}

function closeEnergyDetailsModal() {
  const modal = document.getElementById('energyDetailsModal');
  if (modal) modal.classList.remove('active');
}

// Alternador de Visualização das Tabelas (Consumo vs Custos)
function switchEnergyTable(mode) {
  const wConsumo = document.getElementById('wrapperConsumoTable');
  const wCustos = document.getElementById('wrapperCustosTable');
  const btnConsumo = document.getElementById('btnTabConsumoTable');
  const btnCustos = document.getElementById('btnTabCustosTable');
  const btnBoth = document.getElementById('btnTabBothTables');

  if (btnConsumo) btnConsumo.classList.toggle('active', mode === 'consumo');
  if (btnCustos) btnCustos.classList.toggle('active', mode === 'custos');
  if (btnBoth) btnBoth.classList.toggle('active', mode === 'both');

  if (mode === 'consumo') {
    if (wConsumo) wConsumo.style.display = 'block';
    if (wCustos) wCustos.style.display = 'none';
  } else if (mode === 'custos') {
    if (wConsumo) wConsumo.style.display = 'none';
    if (wCustos) wCustos.style.display = 'block';
  } else {
    if (wConsumo) wConsumo.style.display = 'block';
    if (wCustos) wCustos.style.display = 'block';
  }
}

function renderComparativeTables(history) {
  const tbodyConsumo = document.getElementById('energyConsumoTableBody');
  const tbodyCustos = document.getElementById('energyCustosTableBody');

  if (tbodyConsumo && history.consumptionTable) {
    tbodyConsumo.innerHTML = history.consumptionTable.map(row => {
      const isClosedTag = row.isClosed 
        ? '<span class="table-tag table-tag-closed">Fechado</span>' 
        : '<span class="table-tag table-tag-open">Em Aberto</span>';
      const genDisplay = row.generatorKwh > 0 
        ? `${row.generatorKwh} kWh` 
        : '<span style="color:var(--text-dim);">0.0 kWh (Standby)</span>';

      return `
        <tr class="${row.active ? 'highlight-row' : ''}">
          <td><strong>${row.month}</strong> <small style="display:block; color:var(--text-muted); font-size:10px;">${row.period || ''}</small></td>
          <td><span class="table-kwh-pill">${Number(row.homeKwh).toLocaleString('pt-BR')} kWh</span></td>
          <td><span class="table-kwh-pill" style="color:var(--accent-cyan);">${Number(row.bydKwh).toLocaleString('pt-BR')} kWh</span></td>
          <td>${genDisplay}</td>
          <td><span style="font-family:var(--font-mono);">${row.dailyAverageKwh} kWh/dia</span></td>
          <td>${isClosedTag}</td>
        </tr>
      `;
    }).join('');
  }

  if (tbodyCustos && history.costTable) {
    tbodyCustos.innerHTML = history.costTable.map(row => {
      return `
        <tr class="${row.active ? 'highlight-row' : ''}">
          <td><strong>${row.month}</strong></td>
          <td><span class="table-cost-pill">R$ ${Number(row.totalBill).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span></td>
          <td><span style="font-family:var(--font-mono); font-size:11px;">R$ ${Number(row.effectiveRate).toFixed(4)} / kWh</span></td>
          <td><span style="font-family:var(--font-mono); color:var(--accent-cyan);">R$ ${Number(row.bydCost).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span></td>
          <td><span style="font-family:var(--font-mono); color:#ffffff;">R$ ${Number(row.homeNetCost).toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</span></td>
          <td><span style="font-family:var(--font-mono); font-size:11px;">+R$ ${Number(row.bandeiraAdicional).toFixed(2)} (${row.bandeiraNome})</span></td>
          <td><span style="font-family:var(--font-mono); font-size:11px;">R$ ${Number(row.cipIluminacao).toFixed(2)}</span></td>
          <td><span class="table-tag table-tag-exempt">${row.generatorCostLabel || '⚪ Isento CEEE'}</span></td>
          <td><span style="font-family:var(--font-mono); color:var(--accent-emerald); font-weight:600;">~R$ ${Number(row.bydSavingsVsGas).toLocaleString('pt-BR', {minimumFractionDigits: 0})}</span></td>
        </tr>
      `;
    }).join('');
  }
}

// Modal de Configuração de Tarifa CEEE
async function openTariffConfigModal() {
  const modal = document.getElementById('tariffConfigModal');
  if (!modal) return;

  try {
    const res = await fetch('/api/energy/tariff');
    const data = await res.json();
    document.getElementById('cfgConcessionaria').value = data.concessionaria || 'CEEE Equatorial (RS)';
    document.getElementById('cfgRateKwh').value = data.rateKwh || 1.00234;
    document.getElementById('cfgClosingDay').value = data.closingDay || 18;
    document.getElementById('cfgBandeira').value = data.bandeira || 'amarela';
    document.getElementById('cfgBandeiraFixa').value = data.bandeiraFixaMes || 10.48;
    document.getElementById('cfgCip').value = data.cipIluminacao || 24.50;
    document.getElementById('cfgLastBillKwh').value = data.lastBillKwh || 1112;
  } catch (e) {}

  modal.classList.add('active');
}

function closeTariffConfigModal() {
  const modal = document.getElementById('tariffConfigModal');
  if (modal) modal.classList.remove('active');
}

function handleBandeiraChange() {
  const b = document.getElementById('cfgBandeira').value;
  const fixoEl = document.getElementById('cfgBandeiraFixa');
  if (b === 'verde') fixoEl.value = '0.00';
  else if (b === 'amarela') fixoEl.value = '10.48';
  else if (b === 'vermelha1') fixoEl.value = '24.80';
  else if (b === 'vermelha2') fixoEl.value = '43.80';
}

function applyCeeePreset() {
  document.getElementById('cfgConcessionaria').value = 'CEEE Equatorial (RS)';
  document.getElementById('cfgRateKwh').value = 1.00234;
  document.getElementById('cfgClosingDay').value = 18;
  document.getElementById('cfgBandeira').value = 'amarela';
  document.getElementById('cfgBandeiraFixa').value = 10.48;
  document.getElementById('cfgCip').value = 24.50;
  document.getElementById('cfgLastBillKwh').value = 1112;
  showToast('Preset CEEE Real Aplicado', 'Conta calibrada: 1.112 kWh = R$ 1.149,61 (Tarifa: R$ 1,002 + Bandeira: R$ 10,48 + CIP: R$ 24,50).', '⚡', 'success');
}

async function saveTariffConfig() {
  const concessionaria = document.getElementById('cfgConcessionaria').value.trim() || 'CEEE Equatorial (RS)';
  const rateKwh = parseFloat(document.getElementById('cfgRateKwh').value) || 1.00234;
  const closingDay = parseInt(document.getElementById('cfgClosingDay').value) || 18;
  const bandeira = document.getElementById('cfgBandeira').value;
  const bandeiraFixaMes = parseFloat(document.getElementById('cfgBandeiraFixa').value) || 10.48;
  const cipIluminacao = parseFloat(document.getElementById('cfgCip').value) || 24.50;
  const lastBillKwh = parseInt(document.getElementById('cfgLastBillKwh').value) || 1112;

  const totalCalculated = (lastBillKwh * rateKwh) + bandeiraFixaMes + cipIluminacao;
  const effectiveRateKwh = Number((totalCalculated / lastBillKwh).toFixed(4));

  try {
    const res = await fetch('/api/energy/tariff', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        concessionaria,
        rateKwh,
        closingDay,
        bandeira,
        bandeiraFixaMes,
        cipIluminacao,
        lastBillKwh,
        lastBillTotalReais: Number(totalCalculated.toFixed(2)),
        effectiveRateKwh
      })
    });
    const data = await res.json();
    if (data.success) {
      closeTariffConfigModal();
      showToast('Tarifa CEEE Salva', `Calibrado para ${concessionaria}: Tarifa Efetiva de R$ ${effectiveRateKwh}/kWh!`, '✓', 'success');
      fetchEnergy();
      fetchLogs();
    }
  } catch (e) {
    alert('Erro ao salvar configuração: ' + e.message);
  }
}

// =============================================================
// MODAL DE LANÇAMENTO E EDIÇÃO DE FATURA REAL CEEE (MÊS A MÊS)
// =============================================================
let currentEnergyHistoryData = null;

async function openEditMonthBillModal() {
  const modal = document.getElementById('editMonthBillModal');
  if (!modal) return;

  try {
    const res = await fetch('/api/energy/history');
    currentEnergyHistoryData = await res.json();
    
    // Atualizar opções do select com os meses disponíveis no histórico
    const select = document.getElementById('billInputMonthSelect');
    if (select && currentEnergyHistoryData.monthlyConsumption) {
      const months = currentEnergyHistoryData.monthlyConsumption.map(m => m.month);
      select.innerHTML = months.map(m => `<option value="${m}">${m}</option>`).join('') + '<option value="custom">+ Adicionar Outro Mês...</option>';
    }

    // Carregar primeiro mês
    const firstMonth = currentEnergyHistoryData.monthlyConsumption?.[0]?.month || 'Set/24 (Mês Passado)';
    onSelectMonthToEdit(firstMonth);
  } catch (e) {
    console.error('Erro ao carregar histórico para edição:', e);
  }

  modal.classList.add('active');
}

function closeEditMonthBillModal() {
  const modal = document.getElementById('editMonthBillModal');
  if (modal) modal.classList.remove('active');
}

function onSelectMonthToEdit(monthVal) {
  const customRow = document.getElementById('customMonthInputRow');
  if (monthVal === 'custom') {
    if (customRow) customRow.style.display = 'block';
    document.getElementById('billInputCustomMonth').value = '';
    document.getElementById('billInputPeriod').value = '';
    document.getElementById('billInputHomeKwh').value = '';
    document.getElementById('billInputTotal').value = '';
    document.getElementById('billInputBandeiraVal').value = '0.00';
    document.getElementById('billInputCip').value = '24.50';
    document.getElementById('billInputBydKwh').value = '0.0';
    document.getElementById('billInputGenKwh').value = '0.0';
    recalcBillPreview();
    return;
  }

  if (customRow) customRow.style.display = 'none';
  if (!currentEnergyHistoryData) return;

  const cleanKey = monthVal.slice(0, 6).toLowerCase();
  const cons = (currentEnergyHistoryData.monthlyConsumption || []).find(m => m.month.toLowerCase().startsWith(cleanKey));
  const cost = (currentEnergyHistoryData.monthlyCosts || []).find(m => m.month.toLowerCase().startsWith(cleanKey));

  document.getElementById('billInputPeriod').value = cons?.period || '';
  document.getElementById('billInputHomeKwh').value = cons?.homeKwh !== undefined ? cons.homeKwh : 1112;
  document.getElementById('billInputTotal').value = cost?.totalBill !== undefined ? cost.totalBill : 1149.61;
  
  const bName = (cost?.bandeiraNome || 'Amarela').toLowerCase();
  const selB = document.getElementById('billInputBandeira');
  if (selB) {
    if (bName.includes('verde')) selB.value = 'verde';
    else if (bName.includes('amarel')) selB.value = 'amarela';
    else if (bName.includes('1')) selB.value = 'vermelha1';
    else if (bName.includes('2')) selB.value = 'vermelha2';
  }

  document.getElementById('billInputBandeiraVal').value = cost?.bandeiraAdicional !== undefined ? cost.bandeiraAdicional : 10.48;
  document.getElementById('billInputCip').value = cost?.cipIluminacao !== undefined ? cost.cipIluminacao : 24.50;
  document.getElementById('billInputBydKwh').value = cons?.bydKwh !== undefined ? cons.bydKwh : 285;
  document.getElementById('billInputGenKwh').value = cons?.generatorKwh !== undefined ? cons.generatorKwh : 0.0;
  document.getElementById('billInputStatus').value = (cons?.isClosed === false) ? 'open' : 'closed';

  recalcBillPreview();
}

function onBillBandeiraChange() {
  const b = document.getElementById('billInputBandeira').value;
  const fixoEl = document.getElementById('billInputBandeiraVal');
  if (b === 'verde') fixoEl.value = '0.00';
  else if (b === 'amarela') fixoEl.value = '10.48';
  else if (b === 'vermelha1') fixoEl.value = '24.80';
  else if (b === 'vermelha2') fixoEl.value = '43.80';
  recalcBillPreview();
}

function recalcBillPreview() {
  const homeKwh = parseFloat(document.getElementById('billInputHomeKwh').value) || 0;
  const totalBill = parseFloat(document.getElementById('billInputTotal').value) || 0;
  const bandeiraVal = parseFloat(document.getElementById('billInputBandeiraVal').value) || 0;
  const cipVal = parseFloat(document.getElementById('billInputCip').value) || 0;
  const bydKwh = parseFloat(document.getElementById('billInputBydKwh').value) || 0;

  let effectiveRate = 0;
  let baseRate = 0;
  let bydCost = 0;
  let homeCost = 0;

  if (homeKwh > 0 && totalBill > 0) {
    effectiveRate = totalBill / homeKwh;
    baseRate = Math.max(0, (totalBill - bandeiraVal - cipVal) / homeKwh);
    bydCost = bydKwh * effectiveRate;
    homeCost = Math.max(0, totalBill - bydCost);
  }

  const pEff = document.getElementById('previewEffectiveRate');
  if (pEff) pEff.innerText = `R$ ${effectiveRate.toFixed(4)} / kWh`;

  const pBase = document.getElementById('previewBaseRate');
  if (pBase) pBase.innerText = `R$ ${baseRate.toFixed(4)} / kWh`;

  const pByd = document.getElementById('previewBydCost');
  if (pByd) pByd.innerText = `R$ ${bydCost.toFixed(2)}`;

  const pHome = document.getElementById('previewHomeCost');
  if (pHome) pHome.innerText = `R$ ${homeCost.toFixed(2)}`;
}

async function saveMonthBillData() {
  let month = document.getElementById('billInputMonthSelect').value;
  if (month === 'custom') {
    month = document.getElementById('billInputCustomMonth').value.trim();
    if (!month) {
      alert('Por favor, informe o nome do mês (Ex: Abr/24)');
      return;
    }
  }

  const period = document.getElementById('billInputPeriod').value.trim();
  const homeKwh = parseFloat(document.getElementById('billInputHomeKwh').value) || 0;
  const totalBill = parseFloat(document.getElementById('billInputTotal').value) || 0;
  const bandeiraAdicional = parseFloat(document.getElementById('billInputBandeiraVal').value) || 0;
  const cipIluminacao = parseFloat(document.getElementById('billInputCip').value) || 0;
  const bydKwh = parseFloat(document.getElementById('billInputBydKwh').value) || 0;
  const generatorKwh = parseFloat(document.getElementById('billInputGenKwh').value) || 0;
  const isClosed = document.getElementById('billInputStatus').value === 'closed';

  const bSelect = document.getElementById('billInputBandeira');
  const bandeiraNome = bSelect.options[bSelect.selectedIndex].text.split(' ')[0];

  if (homeKwh <= 0 || totalBill <= 0) {
    alert('Informe o Consumo (kWh) e o Valor Total da Fatura (R$) válidos.');
    return;
  }

  try {
    const res = await fetch('/api/energy/history/month', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        month,
        period,
        homeKwh,
        totalBill,
        bandeiraAdicional,
        bandeiraNome,
        cipIluminacao,
        bydKwh,
        generatorKwh,
        isClosed
      })
    });
    const data = await res.json();
    if (data.success) {
      closeEditMonthBillModal();
      showToast('Fatura Salva', `Conta de ${month} atualizada com sucesso! Total: R$ ${totalBill.toFixed(2)}`, '🧾', 'success');
      fetchEnergy();
      fetchLogs();
    } else {
      alert('Erro ao salvar: ' + (data.error || 'Falha'));
    }
  } catch (err) {
    alert('Erro ao enviar dados da fatura: ' + err.message);
  }
}




// Alternar Disjuntor da Wallbox BYD
async function toggleBydBreaker() {
  const currentState = energyData?.byd?.breakerState ?? true;
  const newState = !currentState;
  if (!confirm(`Deseja realmente ${newState ? 'ARMAR' : 'DESARMAR'} o disjuntor da Wallbox BYD?`)) return;

  try {
    await toggleDevice('ebb5f986e16519ef82o3oa', 16, newState);
    setTimeout(fetchEnergy, 800);
  } catch (e) {
    alert('Erro ao alterar disjuntor: ' + e.message);
  }
}

function openTimerForByd() {
  openEditModal('ebb5f986e16519ef82o3oa');
}

// -------------------------------------------------------------
// Ações Rápidas Estilo Home Assistant (1 Toque)
// -------------------------------------------------------------
async function turnOffAllLights() {
  const lightDevices = devices.filter(d => {
    const isLight = d.category === 'kg' || d.category === 'dj' || (d.name && d.name.toLowerCase().includes('luz'));
    return isLight;
  });

  if (lightDevices.length === 0) {
    showToast('Nenhuma iluminação ativa encontrada.');
    return;
  }
  showToast(`Apagando todas as luzes da residência (${lightDevices.length} interruptores)...`);

  for (const dev of lightDevices) {
    try {
      fetch(`/api/device/${dev.id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dps: 'all', value: false })
      }).catch(() => {});
      if (dev.live_dps) {
        dev.live_dps['1'] = false;
        dev.live_dps['2'] = false;
      }
      dev.is_on = false;
    } catch (e) {}
  }
  renderQuickGrid();
  showToast('Todas as luzes foram apagadas! 🌙');
  setTimeout(fetchDevices, 1200);
}

async function turnOnAllLights() {
  const mainLights = devices.filter(d => {
    const name = (d.name || '').toLowerCase();
    return name.includes('sala') || name.includes('garagem') || name.includes('mizin');
  });

  showToast('Acendendo iluminação principal...');
  for (const dev of mainLights) {
    try {
      fetch(`/api/device/${dev.id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dps: 1, value: true })
      }).catch(() => {});
      if (dev.live_dps) dev.live_dps['1'] = true;
      dev.is_on = true;
    } catch (e) {}
  }
  renderQuickGrid();
  showToast('Iluminação principal ligada! 💡');
  setTimeout(fetchDevices, 1200);
}

async function quickToggleBydBreaker() {
  const bydDev = devices.find(d => d.name && d.name.toLowerCase().includes('byd'));
  if (!bydDev) return;
  const currentOn = bydDev.live_dps ? (bydDev.live_dps['16'] ?? true) : true;
  const targetVal = !currentOn;
  showToast(`${targetVal ? 'Armando' : 'Desarmando'} disjuntor da Wallbox BYD...`);
  try {
    await fetch(`/api/device/${bydDev.id}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dps: 16, value: targetVal })
    });
    if (bydDev.live_dps) bydDev.live_dps['16'] = targetVal;
    renderQuickGrid();
    showToast(`Disjuntor Wallbox BYD ${targetVal ? 'ARMADO ⚡' : 'DESARMADO 🛑'}`);
    fetchDevices();
    fetchEnergy();
  } catch (e) {
    alert('Erro ao acionar Wallbox: ' + e.message);
  }
}

async function quickToggleAc() {
  const acDev = devices.find(d => d.category === 'infrared_ac' || (d.name && d.name.toLowerCase().includes('ar mizin')));
  if (!acDev) return;
  const currentOn = acDev.live_dps ? Boolean(acDev.live_dps['1']) : false;
  const cmd = currentOn ? 'PowerOff' : 'PowerOn';
  showToast(`Enviando comando: ${cmd === 'PowerOn' ? 'Ligar Ar ❄️' : 'Desligar Ar 🛑'}...`);
  await sendAcCommand(acDev.id, cmd);
}

// Carrega dispositivos
async function fetchDevices() {
  try {
    const res = await fetch('/api/devices');
    devices = await res.json();
    try {
      localStorage.setItem('mizin_cached_devices', JSON.stringify(devices));
    } catch (e) {}

    const countEl = document.getElementById('totalDeviceBadge');
    if (countEl) countEl.innerText = devices.length;

    // Atualiza status do portão no card de topo (Visão Geral)
    const gateDev = devices.find(d => d.category === 'ckmkzq' || (d.name && d.name.toLowerCase().includes('portão')));
    let isGateOpen = false;
    if (gateDev) {
      const gDps = gateDev.live_dps || {};
      isGateOpen = gDps['3'] === true || gDps['6'] === 'open';
    }
    updateGateUiState(isGateOpen);

    // Renderização dinâmica dos Glance Chips e Atalhos
    renderGlanceBar();

    renderQuickGrid();
    renderDevicesTable();
    renderCustomShortcuts();
  } catch (err) {
    console.error('Erro ao carregar dispositivos:', err);
  }
}

// Carrega dispositivos fixados no Guia Rápido do LocalStorage
function getPinnedDevices() {
  try {
    const saved = localStorage.getItem('mizin_pinned_devices');
    if (saved) return JSON.parse(saved);
  } catch (e) {}
  // Default inicial com os principais aparelhos da residência
  return [
    'eb49c5d1977172327aqb1q', // Portão
    'eb6227b63a58b256579aim', // Luzes Sala
    'eb786ebb970e6a20ffj0ls', // Tomada Ar - JR
    'ebb5f986e16519ef82o3oa', // Wallbox BYD
    'ebce2ea581c2690311qvem', // Wattímetro Home
    'ebaee623fb5d8b4545zhx3', // Interruptor Mizin
    'eb75753e5d4f53f3dbf4sv', // Tomada Ar - Cris
    'ebbe3e7e35f15b989avdos', // Ar Mizin
    'ebe317c237358405b8h5n8', // Luzes Rua
    'eba364bce4af5a110fyw70'  // Tomadas Cama - JR
  ];
}

function togglePinDevice(devId, event) {
  if (event) event.stopPropagation();
  let pinned = getPinnedDevices();
  if (pinned.includes(devId)) {
    pinned = pinned.filter(id => id !== devId);
  } else {
    pinned.push(devId);
  }
  localStorage.setItem('mizin_pinned_devices', JSON.stringify(pinned));
  syncSaveUiConfig({ pinnedDevices: pinned });
  renderQuickGrid();
  renderQuickSearchExtras();
  renderManageList();
  renderDevicesTable();
}

function pinAllDevices(shouldPin) {
  const pinnedIds = shouldPin ? devices.map(d => d.id) : [];
  localStorage.setItem('mizin_pinned_devices', JSON.stringify(pinnedIds));
  syncSaveUiConfig({ pinnedDevices: pinnedIds });
  renderQuickGrid();
  renderQuickSearchExtras();
  renderManageList();
  renderDevicesTable();
}

// Modal de Gerenciamento do Guia Rápido
function openManageQuickGridModal() {
  document.getElementById('manageQuickGridModal').classList.add('active');
  renderManageList();
}

function closeManageQuickGridModal() {
  document.getElementById('manageQuickGridModal').classList.remove('active');
  renderQuickGrid();
}

function filterManageList() {
  renderManageList();
}

function renderManageList() {
  const listEl = document.getElementById('manageDeviceList');
  const badgeEl = document.getElementById('manageCountBadge');
  const query = (document.getElementById('manageSearchInput')?.value || '').toLowerCase();
  if (!listEl) return;

  const pinned = getPinnedDevices();
  if (badgeEl) badgeEl.innerText = `Exibindo ${pinned.length} de ${devices.length} aparelhos no Guia Rápido`;

  const filtered = devices.filter(d => {
    const name = (d.name || '').toLowerCase();
    const room = (d.room || '').toLowerCase();
    return name.includes(query) || room.includes(query);
  });

  if (filtered.length === 0) {
    listEl.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 20px;">Nenhum dispositivo encontrado para "${query}".</div>`;
    return;
  }

  listEl.innerHTML = filtered.map(dev => {
    const isPinned = pinned.includes(dev.id);
    const isOnline = dev.online || (dev.live_dps && Object.keys(dev.live_dps).length > 0);
    return `
      <div class="manage-dev-row">
        <div class="manage-dev-left">
          <div class="manage-dev-icon">${getDeviceIcon(dev.category)}</div>
          <div>
            <div class="manage-dev-name">${dev.name} ${dev.room ? `<span style="font-size: 11px; color: var(--accent-cyan);">[${dev.room}]</span>` : ''}</div>
            <div class="manage-dev-meta">${dev.local_ip || 'Sub-dispositivo'} • ${isOnline ? '<span style="color:var(--accent-emerald);">Online</span>' : '<span style="color:var(--text-dim);">Standby</span>'}</div>
          </div>
        </div>
        <button class="btn-pin ${isPinned ? 'is-pinned' : 'is-unpinned'}" onclick="togglePinDevice('${dev.id}', event)">
          ${isPinned ? '✓ No Guia Rápido' : '+ Adicionar à Tela'}
        </button>
      </div>
    `;
  }).join('');
}

// -------------------------------------------------------------
// Busca Rápida Direta no Guia & Exibição de Extras
// -------------------------------------------------------------
let quickSearchQuery = '';
let inventorySearchQuery = '';

function handleQuickSearchInput(val) {
  quickSearchQuery = (val || '').trim().toLowerCase();
  const clearBtn = document.getElementById('btnClearQuickSearch');
  if (clearBtn) clearBtn.style.display = quickSearchQuery ? 'block' : 'none';

  renderQuickGrid();
  renderQuickSearchExtras();
}

function clearQuickSearch() {
  quickSearchQuery = '';
  const input = document.getElementById('quickGridSearchInput');
  if (input) input.value = '';
  const clearBtn = document.getElementById('btnClearQuickSearch');
  if (clearBtn) clearBtn.style.display = 'none';

  renderQuickGrid();
  renderQuickSearchExtras();
}

function renderQuickSearchExtras() {
  const box = document.getElementById('quickSearchExtraBox');
  const list = document.getElementById('quickSearchExtraList');
  if (!box || !list) return;

  if (!quickSearchQuery) {
    box.style.display = 'none';
    return;
  }

  const pinned = getPinnedDevices();
  const unpinnedMatches = devices.filter(d => {
    if (pinned.includes(d.id)) return false;
    const name = (d.name || '').toLowerCase();
    const room = (d.room || '').toLowerCase();
    const cat = (d.category || '').toLowerCase();
    const ip = (d.local_ip || '').toLowerCase();
    return name.includes(quickSearchQuery) || room.includes(quickSearchQuery) || cat.includes(quickSearchQuery) || ip.includes(quickSearchQuery);
  });

  if (unpinnedMatches.length === 0) {
    box.style.display = 'none';
    return;
  }

  box.style.display = 'block';
  list.innerHTML = unpinnedMatches.map(dev => `
    <div class="extra-card">
      <div style="display:flex; align-items:center; gap:10px;">
        <div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;color:var(--accent-cyan);">
          ${getDeviceIcon(dev.category)}
        </div>
        <div>
          <div style="font-size:13px; font-weight:600;">${dev.name}</div>
          <div style="font-size:11px; color:var(--text-dim);">${dev.room || 'Sem cômodo'} • ${dev.local_ip || 'Local'}</div>
        </div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="addDeviceToGuide('${dev.id}', event)">
        ➕ Adicionar ao Guia
      </button>
    </div>
  `).join('');
}

function addDeviceToGuide(devId, event) {
  if (event) event.stopPropagation();
  let pinned = getPinnedDevices();
  if (!pinned.includes(devId)) {
    pinned.push(devId);
    localStorage.setItem('mizin_pinned_devices', JSON.stringify(pinned));
  }
  renderQuickGrid();
  renderQuickSearchExtras();
  renderManageList();
  renderDevicesTable();
}

// -------------------------------------------------------------
// Renderiza Controles Rápidos na Visão Geral
// -------------------------------------------------------------
function renderQuickGrid() {
  const grid = document.getElementById('quickGrid');
  if (!grid) return;

  const favs = getFavorites();
  const pinned = getPinnedDevices();

  const countBadge = document.getElementById('countGuideBadge');
  if (countBadge) countBadge.innerText = pinned.length;

  // Encontra tomada do ar
  const jrSocket = devices.find(d => d.name && d.name.toLowerCase().includes('tomada ar - jr'));
  const isJrSocketOn = jrSocket ? (jrSocket.live_dps ? Boolean(jrSocket.live_dps['1']) : Boolean(jrSocket.is_on)) : true;

  // Aplica filtro por busca ou cômodos
  let filtered = devices.filter(dev => {
    const room = dev.room || '';
    const name = dev.name || '';
    const isPinned = pinned.includes(dev.id);

    // Se estiver usando busca rápida no Guia
    if (quickSearchQuery) {
      return isPinned && (
        name.toLowerCase().includes(quickSearchQuery) ||
        room.toLowerCase().includes(quickSearchQuery)
      );
    }

    if (currentRoomFilter === 'all') {
      return isPinned;
    }
    if (currentRoomFilter === 'fav') {
      return favs.includes(dev.id);
    }
    return (
      name.toLowerCase().includes(currentRoomFilter.toLowerCase()) ||
      room.toLowerCase().includes(currentRoomFilter.toLowerCase())
    );
  });

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; color: var(--text-dim); padding: 40px 20px;">
        <p style="font-size: 15px; margin-bottom: 14px;">Nenhum dispositivo exibido neste filtro.</p>
        <button class="btn btn-primary btn-sm" onclick="openManageQuickGridModal()">⚙️ Personalizar Guia Rápido</button>
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered.map(dev => {
    const isOnline = dev.online || (dev.live_dps && Object.keys(dev.live_dps).length > 0);
    const isFav = favs.includes(dev.id);
    const liveDps = dev.live_dps || {};
    const ip = dev.local_ip || 'Infravermelho';

    // Dispositivo Portão (Home Assistant Cover / Gate Opener - 1 Canal de Pulso + Sensor Magnético)
    const isGate = dev.category === 'ckmkzq' || dev.category === 'portao' || (dev.name && (dev.name.toLowerCase().includes('portão') || dev.name.toLowerCase().includes('portao')));
    if (isGate) {
      const isOpen = liveDps['3'] === true || liveDps['6'] === 'open';

      // Máquina de estados dinâmica: Fechado -> Abrindo -> Aberto -> Fechando -> Fechado
      let gateStatusTitle = isOpen ? 'Portão Aberto 🚨' : 'Portão Fechado & Trancado 🔒';
      let gateStatusSub = isOpen ? 'Sensor Magnético: Aberto / Liberado' : 'Sensor Magnético: Fechado & Seguro';
      let gateBadgeText = isOpen ? 'ABERTO' : 'FECHADO';
      let gateBadgeClass = isOpen ? 'badge badge-live' : 'badge badge-emerald';
      let gateBtnText = isOpen ? 'Fechar Portão 🚪🔻' : 'Abrir Portão 🚪🔺';
      let gateBtnPulse = false;

      if (window.gateTransitState === 'opening') {
        if (isOpen) {
          window.gateTransitState = null;
          gateStatusTitle = 'Portão Aberto 🚨';
          gateStatusSub = 'Sensor Magnético: Aberto / Liberado';
          gateBadgeText = 'ABERTO';
          gateBadgeClass = 'badge badge-live';
          gateBtnText = 'Fechar Portão 🚪🔻';
        } else {
          gateStatusTitle = 'Abrindo Portão... ⏳';
          gateStatusSub = 'Motor acionado • Aguardando curso de abertura';
          gateBadgeText = 'ABRINDO';
          gateBadgeClass = 'badge badge-mode';
          gateBtnText = 'Abrindo... ⏳';
          gateBtnPulse = true;
        }
      } else if (window.gateTransitState === 'closing') {
        if (!isOpen) {
          window.gateTransitState = null;
          gateStatusTitle = 'Portão Fechado & Trancado 🔒';
          gateStatusSub = 'Sensor Magnético: Fechado & Seguro';
          gateBadgeText = 'FECHADO';
          gateBadgeClass = 'badge badge-emerald';
          gateBtnText = 'Abrir Portão 🚪🔺';
        } else {
          gateStatusTitle = 'Fechando Portão... ⏳';
          gateStatusSub = 'Motor acionado • Aguardando fechamento total';
          gateBadgeText = 'FECHANDO';
          gateBadgeClass = 'badge badge-warning';
          gateBtnText = 'Fechando... ⏳';
          gateBtnPulse = true;
        }
      }

      return `
        <div class="device-card gate-special-card" id="card-${dev.id}">
          <div class="device-card-header">
            <div class="dev-icon-wrap" style="color: var(--accent-cyan); background: rgba(56, 189, 248, 0.1);">
              ${getDeviceIcon('ckmkzq')}
            </div>
            <div class="dev-meta">
              <div class="dev-name-row">
                <span class="fav-star ${isFav ? 'active' : ''}" onclick="toggleFavorite('${dev.id}', event)" title="Favoritar">★</span>
                <div class="dev-name">${dev.name}</div>
                <span class="edit-btn" onclick="openEditModal('${dev.id}', event)" title="Editar Dispositivo">✏️</span>
              </div>
              <div class="dev-room">${dev.room ? '📍 ' + dev.room : 'Garagem & Acesso'}</div>
            </div>
            <div>
              <span class="${gateBadgeClass}" id="gateCardBadge-${dev.id}">
                ${gateBadgeText}
              </span>
            </div>
          </div>

          <div class="gate-card-body">
            <div class="gate-sensor-status-ha">
              <div class="gate-sensor-badge-line">
                <span class="status-dot ${isOpen ? 'offline' : 'online'}"></span>
                <span class="gate-sensor-title" id="gateSensorTitle-${dev.id}">${gateStatusTitle}</span>
              </div>
              <span class="gate-sensor-sub" id="gateSensorSub-${dev.id}">${gateStatusSub}</span>
            </div>
            <button class="gate-action-btn-main ${gateBtnPulse ? 'is-pulsing' : ''}" id="btnGateCardPulse-${dev.id}" onclick="triggerGatePulse('${dev.id}', event)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;margin-right:6px;"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11"/></svg>
              <span id="btnGateCardText-${dev.id}">${gateBtnText}</span>
            </button>
          </div>

          <div class="device-card-footer">
            <span>IP: ${ip}</span>
            <span style="color: ${isOnline ? 'var(--accent-emerald)' : 'var(--text-dim)'}">
              ${isOnline ? '● Online Local' : '○ Standby'}
            </span>
          </div>
        </div>
      `;
    }

    // Dispositivo com 2 Canais (ex: Luzes Sala, Interruptor Mizin, Luzes Rua, Tomadas Cama)
    // EXCLUI o portão para nunca renderizar erroneamente como interruptor de luz
    const is2Gang = !isGate && ((typeof liveDps['2'] === 'boolean') || (dev.status && typeof dev.status.switch_2 === 'boolean') || (dev.channel_names && (dev.channel_names['1'] || dev.channel_names['2'])));
    if (is2Gang) {
      const ch1Name = dev.channel_names?.['1'] || 'Canal 1 (L1)';
      const ch2Name = dev.channel_names?.['2'] || 'Canal 2 (L2)';

      const ch1On = liveDps['1'] !== undefined ? Boolean(liveDps['1']) : Boolean(dev.status?.switch_1);
      const ch2On = liveDps['2'] !== undefined ? Boolean(liveDps['2']) : Boolean(dev.status?.switch_2);
      const masterOn = ch1On || ch2On;
      const activeClass = masterOn ? 'is-active' : '';

      return `
        <div class="device-card ${activeClass}" id="card-${dev.id}">
          <div class="device-card-header">
            <div class="dev-icon-wrap">
              ${getDeviceIcon(dev.category)}
            </div>
            <div class="dev-meta">
              <div class="dev-name-row">
                <span class="fav-star ${isFav ? 'active' : ''}" onclick="toggleFavorite('${dev.id}', event)" title="Favoritar">★</span>
                <div class="dev-name">${dev.name}</div>
                <span class="edit-btn" onclick="openEditModal('${dev.id}', event)" title="Editar Nome, Canais e Temporizador">✏️</span>
              </div>
              <div class="dev-room">${dev.room ? '📍 ' + dev.room : (dev.product_name || dev.model || 'Tuya 2-Canais')}</div>
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 4px;">
              <span style="font-size: 10px; font-weight: 700; color: ${masterOn ? 'var(--accent-cyan)' : 'var(--text-dim)'}; letter-spacing: 0.5px;">GERAL</span>
              <label class="toggle-switch">
                <input type="checkbox" ${masterOn ? 'checked' : ''} onchange="toggleDevice('${dev.id}', 'all', this.checked)">
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          <!-- Canais 1 e 2 Independentes com Nomes Personalizados -->
          <div class="two-channel-container">
            <div class="channel-row">
              <div class="channel-info">
                <span class="channel-bullet ${ch1On ? 'on' : ''}"></span>
                <span class="channel-name">${ch1Name}</span>
                <span class="channel-state-text" style="color: ${ch1On ? 'var(--accent-emerald)' : 'var(--text-dim)'}">${ch1On ? 'Ligado' : 'Desligado'}</span>
              </div>
              <label class="toggle-switch" style="transform: scale(0.85); transform-origin: right center;">
                <input type="checkbox" ${ch1On ? 'checked' : ''} onchange="toggleDevice('${dev.id}', 1, this.checked)">
                <span class="toggle-slider"></span>
              </label>
            </div>

            <div class="channel-row">
              <div class="channel-info">
                <span class="channel-bullet ${ch2On ? 'on' : ''}"></span>
                <span class="channel-name">${ch2Name}</span>
                <span class="channel-state-text" style="color: ${ch2On ? 'var(--accent-emerald)' : 'var(--text-dim)'}">${ch2On ? 'Ligado' : 'Desligado'}</span>
              </div>
              <label class="toggle-switch" style="transform: scale(0.85); transform-origin: right center;">
                <input type="checkbox" ${ch2On ? 'checked' : ''} onchange="toggleDevice('${dev.id}', 2, this.checked)">
                <span class="toggle-slider"></span>
              </label>
            </div>
          </div>

          <div class="device-card-footer">
            <span>IP: ${ip}</span>
            <span style="color: ${isOnline ? 'var(--accent-emerald)' : 'var(--text-dim)'}">
              ${isOnline ? '● Online Local' : '○ Standby'}
            </span>
          </div>
        </div>
      `;
    }

    // Status do switch primário (DPS 1 ou 16)
    let isTurnedOn = false;
    if (liveDps['1'] !== undefined) isTurnedOn = Boolean(liveDps['1']);
    else if (liveDps['16'] !== undefined) isTurnedOn = Boolean(liveDps['16']);
    else if (dev.status?.switch_1 !== undefined) isTurnedOn = Boolean(dev.status.switch_1);
    else if (dev.status?.switch_led !== undefined) isTurnedOn = Boolean(dev.status.switch_led);

    const activeClass = isTurnedOn ? 'is-active' : '';

    // Telemetria extra (Volts / Watts para tomadas)
    let telemetryHtml = '';
    if (liveDps['20']) {
      const v = (liveDps['20'] / 10).toFixed(1);
      const w = liveDps['19'] ? (liveDps['19'] / 10).toFixed(1) : '0';
      telemetryHtml = `<div class="dev-telemetry-badge">${v}V • ${w}W</div>`;
    }

    // Controle do Ar Condicionado
    let extraBottomHtml = '';
    const isAc = dev.category === 'infrared_ac' || dev.name.toLowerCase().includes('ar mizin');
    if (isAc) {
      if (!isJrSocketOn && jrSocket) {
        extraBottomHtml = `
          <div class="ac-socket-warning" onclick="toggleDevice('${jrSocket.id}', 1, true)" title="A tomada do ar está desligada. Clique para energizar.">
            ⚠️ Tomada 220V do Ar DESLIGADA (Clique para ligar tomada)
          </div>
        `;
      } else {
        extraBottomHtml = `
          <div class="ac-controls-row">
            <span class="badge badge-emerald">220V Conectado</span>
            <div class="ac-temp-controls">
              <button class="btn-micro" onclick="sendAcCommand('${dev.id}', 'PowerOff', event)" title="Desligar Ar">Desligar</button>
              <button class="btn-micro btn-micro-primary" onclick="sendAcCommand('${dev.id}', 'PowerOn', event)" title="Ligar Ar">Ligar</button>
            </div>
          </div>
        `;
      }
    }

    return `
      <div class="device-card ${activeClass}" id="card-${dev.id}">
        <div class="device-card-header">
          <div class="dev-icon-wrap">
            ${getDeviceIcon(dev.category)}
          </div>
          <div class="dev-meta">
            <div class="dev-name-row">
              <span class="fav-star ${isFav ? 'active' : ''}" onclick="toggleFavorite('${dev.id}', event)" title="Favoritar">★</span>
              <div class="dev-name">${dev.name}</div>
              <span class="edit-btn" onclick="openEditModal('${dev.id}', event)" title="Editar Nome e Temporizador">✏️</span>
            </div>
            <div class="dev-room">${dev.room ? '📍 ' + dev.room : (dev.product_name || dev.model || 'Tuya Local')}</div>
            ${telemetryHtml}
          </div>
          <label class="toggle-switch">
            <input type="checkbox" ${isTurnedOn ? 'checked' : ''} onchange="toggleDevice('${dev.id}', 1, this.checked)">
            <span class="toggle-slider"></span>
          </label>
        </div>
        ${extraBottomHtml}
        <div class="device-card-footer">
          <span>IP: ${ip}</span>
          <span style="color: ${isOnline ? 'var(--accent-emerald)' : 'var(--text-dim)'}">
            ${isOnline ? '● Online Local' : '○ Standby'}
          </span>
        </div>
      </div>
    `;
  }).join('');
}

// Envio de comando infravermelho de ar condicionado
async function sendAcCommand(devId, cmdCode, event) {
  if (event) event.stopPropagation();
  try {
    const res = await fetch(`/api/device/${devId}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: cmdCode, value: cmdCode })
    });
    const data = await res.json();
    console.log('[*] Resposta comando AC:', data);
    setTimeout(fetchDevices, 600);
  } catch (err) {
    alert('Erro ao enviar comando para o Ar: ' + err.message);
  }
}

// Modal de Edição de Dispositivo
let currentEditingDevId = null;

async function openEditModal(devId, event) {
  if (event) event.stopPropagation();
  currentEditingDevId = devId;
  const dev = devices.find(d => d.id === devId);
  if (!dev) return;

  document.getElementById('editDevId').value = dev.id;
  document.getElementById('editDevName').value = dev.name;
  document.getElementById('editDevRoom').value = dev.room || 'Sala';

  // Verifica se é 2 canais para mostrar inputs de canal (exclui portão)
  const isGate = dev.category === 'ckmkzq' || dev.category === 'portao' || (dev.name && (dev.name.toLowerCase().includes('portão') || dev.name.toLowerCase().includes('portao')));
  const is2Gang = !isGate && ((dev.live_dps && typeof dev.live_dps['2'] === 'boolean') || (dev.status && typeof dev.status.switch_2 === 'boolean') || (dev.channel_names && (dev.channel_names['1'] || dev.channel_names['2'])));
  const twoChannelSection = document.getElementById('twoChannelNamesSection');
  if (twoChannelSection) {
    if (is2Gang) {
      twoChannelSection.style.display = 'block';
      document.getElementById('editDevChannel1').value = dev.channel_names?.['1'] || '';
      document.getElementById('editDevChannel2').value = dev.channel_names?.['2'] || '';
    } else {
      twoChannelSection.style.display = 'none';
    }
  }

  // Verifica se existe timer ativo
  const notice = document.getElementById('activeTimerNotice');
  if (notice) notice.style.display = 'none';

  try {
    const res = await fetch('/api/schedules');
    const schedules = await res.json();
    const active = schedules.find(s => s.devId === devId && s.enabled && s.type === 'timer');
    if (active && notice) {
      const remainingMin = Math.max(1, Math.round((active.triggerAt - Date.now()) / 60000));
      notice.style.display = 'block';
      notice.innerHTML = `⏱️ Timer ativo: Desligamento em <strong>${remainingMin} min</strong>. <a href="#" style="color:var(--accent-rose); margin-left:6px;" onclick="cancelTimer('${active.id}', event)">[Cancelar]</a>`;
    }
  } catch (e) {}

  document.getElementById('editDeviceModal').classList.add('active');
}

function closeEditModal() {
  document.getElementById('editDeviceModal').classList.remove('active');
  currentEditingDevId = null;
}

async function setQuickTimer(minutes) {
  const devId = document.getElementById('editDevId').value || currentEditingDevId;
  const dev = devices.find(d => d.id === devId);
  if (!devId) return;

  try {
    const res = await fetch('/api/schedules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        devId,
        devName: dev?.name || 'Dispositivo',
        dps: (devId === 'ebb5f986e16519ef82o3oa') ? 16 : 1,
        value: false, // auto-off
        type: 'timer',
        minutes: minutes
      })
    });
    const data = await res.json();
    if (data.success) {
      const notice = document.getElementById('activeTimerNotice');
      if (notice) {
        notice.style.display = 'block';
        notice.innerHTML = `✅ Desligamento programado para daqui a <strong>${minutes} minutos</strong>!`;
      }
    }
  } catch (e) {
    alert('Erro ao agendar timer: ' + e.message);
  }
}

async function cancelTimer(schedId, event) {
  if (event) event.preventDefault();
  try {
    await fetch(`/api/schedules/${schedId}`, { method: 'DELETE' });
    const notice = document.getElementById('activeTimerNotice');
    if (notice) notice.style.display = 'none';
  } catch (e) {
    alert('Erro ao cancelar timer: ' + e.message);
  }
}

async function saveDeviceCustomization() {
  const devId = document.getElementById('editDevId').value;
  const name = document.getElementById('editDevName').value.trim();
  const room = document.getElementById('editDevRoom').value;
  const ch1 = document.getElementById('editDevChannel1')?.value.trim() || '';
  const ch2 = document.getElementById('editDevChannel2')?.value.trim() || '';

  if (!name) return alert('Por favor, informe um nome.');

  try {
    const res = await fetch(`/api/device/${devId}/customize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        room,
        channel1Name: ch1,
        channel2Name: ch2
      })
    });
    const data = await res.json();
    if (data.success) {
      closeEditModal();
      fetchDevices();
    } else {
      alert('Erro ao salvar: ' + (data.error || 'Falha'));
    }
  } catch (err) {
    alert('Falha na requisição: ' + err.message);
  }
}

function openQrSmartLife() {
  window.open('http://' + window.location.hostname + ':19850', '_blank');
}

async function syncLanDevices() {
  const btn = document.getElementById('btnSyncLanDevices');
  const spinner = document.getElementById('syncDevicesSpinner');
  if (spinner) spinner.style.display = 'inline-block';
  if (btn) btn.disabled = true;
  showToast('Varrendo Rede...', 'Procurando novos aparelhos Tuya e Smart Life na rede local...', '🔄', 'info');

  try {
    const res = await fetch(`${BACKEND_API_BASE}/api/devices/scan`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      await fetchDevices();
      showToast('Sincronização Concluída!', `${data.count} aparelhos verificados e atualizados na rede.`, '✅', 'success');
    } else {
      showToast('Erro na Sincronização', data.error || 'Falha ao escanear rede', '⚠️', 'danger');
    }
  } catch (err) {
    showToast('Erro de Conexão', err.message, '⚠️', 'danger');
  } finally {
    if (spinner) spinner.style.display = 'none';
    if (btn) btn.disabled = false;
  }
}

async function startNetworkScan() {
  const area = document.getElementById('scanResultsArea');
  const msg = document.getElementById('scanStatusMsg');
  const btn = document.getElementById('btnScanRun');

  if (area) area.style.display = 'block';
  if (msg) msg.innerText = 'Escaneando rede 192.168.1.0/24 e sincronizando aparelhos... Aguarde ~4s';
  if (btn) btn.disabled = true;

  try {
    const res = await fetch(`${BACKEND_API_BASE}/api/devices/scan`, { method: 'POST' });
    const data = await res.json();
    await fetchDevices();
    if (msg) msg.innerText = `Varredura concluída! ${data.count || devices.length} dispositivos encontrados e sincronizados.`;
  } catch (e) {
    if (msg) msg.innerText = 'Erro na varredura: ' + e.message;
  } finally {
    if (btn) btn.disabled = false;
  }
}

function filterInventoryTable(query) {
  inventorySearchQuery = (query || '').toLowerCase();
  renderDevicesTable();
}

// Renderiza Tabela de Todos os Dispositivos
function renderDevicesTable() {
  const tbody = document.getElementById('devicesTableBody');
  if (!tbody) return;

  const pinned = getPinnedDevices();

  const filtered = devices.filter(d => {
    if (!inventorySearchQuery) return true;
    const name = (d.name || '').toLowerCase();
    const room = (d.room || '').toLowerCase();
    const ip = (d.local_ip || '').toLowerCase();
    return name.includes(inventorySearchQuery) || room.includes(inventorySearchQuery) || ip.includes(inventorySearchQuery);
  });

  tbody.innerHTML = filtered.map(dev => {
    const isOnline = dev.online || (dev.live_dps && Object.keys(dev.live_dps).length > 0);
    const ip = dev.local_ip || 'Sub-dispositivo';
    const liveDps = dev.live_dps || {};
    const isPinned = pinned.includes(dev.id);
    
    let isTurnedOn = false;
    if (liveDps['1'] !== undefined) isTurnedOn = Boolean(liveDps['1']);
    else if (liveDps['16'] !== undefined) isTurnedOn = Boolean(liveDps['16']);
    else if (dev.status?.switch_1 !== undefined) isTurnedOn = Boolean(dev.status.switch_1);
    else if (dev.status?.switch_led !== undefined) isTurnedOn = Boolean(dev.status.switch_led);

    let telemetria = '-';
    if (liveDps['20']) telemetria = `${(liveDps['20']/10).toFixed(1)}V • ${liveDps['19'] ? (liveDps['19']/10).toFixed(1) : 0}W`;
    else if (liveDps['116']) telemetria = `${(liveDps['116']/10).toFixed(1)}V • ${((liveDps['117']||0)/1000).toFixed(2)}A • ${liveDps['118']||0}W`;

    return `
      <tr>
        <td>
          <span class="status-dot ${isOnline ? 'online' : 'offline'}"></span>
          ${isOnline ? 'Online' : 'Offline / Standby'}
        </td>
        <td>
          <strong>${dev.name}</strong>
          ${dev.room ? `<span style="font-size: 11px; color: var(--accent-cyan); margin-left: 6px;">[${dev.room}]</span>` : ''}
          <span class="edit-btn" onclick="openEditModal('${dev.id}', event)">✏️</span>
        </td>
        <td style="font-family: var(--font-mono); color: var(--accent-cyan);">${ip}</td>
        <td>${dev.product_name || dev.category}</td>
        <td style="font-family: var(--font-mono); color: var(--accent-emerald);">${telemetria}</td>
        <td>
          <button class="btn-pin ${isPinned ? 'is-pinned' : 'is-unpinned'}" onclick="togglePinDevice('${dev.id}', event)">
            ${isPinned ? '✓ No Guia' : '+ Adicionar'}
          </button>
        </td>
        <td>
          <button class="btn btn-primary" style="padding: 4px 10px; font-size: 11px;" onclick="toggleDevice('${dev.id}', 1, ${!isTurnedOn})">
            ${isTurnedOn ? 'Desligar' : 'Ligar'}
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// =============================================================
// FLOATING TOASTS NOTIFICATION SYSTEM (HOME ASSISTANT STYLE)
// =============================================================
function showToast(title, message, icon = '⚡', type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const validTypes = ['info', 'success', 'warning', 'danger', 'error'];
  let toastTitle = title || '';
  let toastMsg = message;
  let toastIcon = icon;
  let toastType = type;

  // Se o 2º parâmetro for um tipo (ex: showToast('Alerta!', 'warning'))
  if (typeof toastMsg === 'string' && validTypes.includes(toastMsg)) {
    toastType = toastMsg;
    toastMsg = '';
  }

  // Se toastMsg for undefined, null ou a string literal 'undefined'
  if (!toastMsg || toastMsg === 'undefined' || typeof toastMsg !== 'string') {
    toastMsg = '';
  }

  // Ajusta ícone padrão caso seja o padrão '⚡' mas o tipo for específico
  if (toastIcon === '⚡') {
    if (toastType === 'success') toastIcon = '✅';
    else if (toastType === 'warning') toastIcon = '⚠️';
    else if (toastType === 'danger' || toastType === 'error') toastIcon = '🚨';
  }

  const card = document.createElement('div');
  card.className = `toast-card toast-${toastType}`;
  card.innerHTML = `
    <div class="toast-icon">${toastIcon}</div>
    <div class="toast-body">
      <div class="toast-title">${toastTitle}</div>
      ${toastMsg ? `<div class="toast-msg">${toastMsg}</div>` : ''}
    </div>
    <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
  `;

  container.appendChild(card);

  setTimeout(() => {
    card.classList.add('toast-hiding');
    setTimeout(() => card.remove(), 250);
  }, 4200);
}

// =============================================================
// AÇÕES DE CONTROLE & TOGGLES
// =============================================================
async function toggleDevice(devId, dps, value) {
  const dev = devices.find(d => d.id === devId || d.local_ip === devId);
  const devName = dev?.name || devId;
  const chLabel = dps === 'all' ? 'Geral' : (dev?.channel_names?.[String(dps)] || `Canal ${dps}`);

  console.log(`Alterando dispositivo ${devName} (${devId}): DPS ${dps} = ${value}`);
  
  // Atualização otimista na tela
  const card = document.getElementById(`card-${devId}`);
  if (card && dps === 'all') {
    if (value) card.classList.add('is-active');
    else card.classList.remove('is-active');
  }

  showToast(devName, `${chLabel} alterado para ${value ? 'Ligado' : 'Desligado'}`, '💡', value ? 'success' : 'info');

  try {
    const res = await fetch(`/api/device/${devId}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dps, value })
    });
    const data = await res.json();
    console.log('Resposta do comando:', data);
    
    setTimeout(() => {
      fetchDevices();
      fetchLogs();
    }, 500);
  } catch (err) {
    console.error('Falha ao enviar comando:', err);
    showToast('Falha no Comando', err.message, '⚠️', 'danger');
  }
}

// =============================================================
// MÁQUINA DE ESTADOS DINÂMICA DO PORTÃO RESIDENCIAL
// =============================================================
window.gateTransitState = window.gateTransitState || null; // 'opening' | 'closing' | null
let gatePollingInterval = null;
let gatePollCycles = 0;

function updateGateUiState(isGateOpen) {
  const topGateBadge = document.getElementById('gateStateBadge');
  const topGateDesc = document.getElementById('gateStateDesc');
  const btnPulseGate = document.getElementById('btnPulseGate');
  const camBarStatus = document.getElementById('camBarGateStatus');
  const camBarIcon = document.getElementById('camBarGateIcon');
  const ptzGateStatus = document.getElementById('ptzFloatingGateStatus');

  if (window.gateTransitState === 'opening') {
    if (topGateBadge) {
      topGateBadge.innerText = '⏳ ABRINDO';
      topGateBadge.className = 'badge badge-mode';
    }
    if (topGateDesc) {
      topGateDesc.innerText = 'Abrindo Portão... ⏳';
      topGateDesc.style.color = 'var(--accent-cyan)';
    }
    if (btnPulseGate) {
      btnPulseGate.disabled = true;
      btnPulseGate.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;margin-right:6px;"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11"/></svg> Abrindo... ⏳';
    }
    if (camBarStatus) {
      camBarStatus.innerHTML = 'Abrindo... ⏳';
      camBarStatus.style.color = 'var(--accent-cyan)';
    }
    if (ptzGateStatus) {
      ptzGateStatus.innerHTML = 'Abrindo... ⏳';
      ptzGateStatus.style.color = 'var(--accent-cyan)';
    }
  } else if (window.gateTransitState === 'closing') {
    if (topGateBadge) {
      topGateBadge.innerText = '⏳ FECHANDO';
      topGateBadge.className = 'badge badge-warning';
    }
    if (topGateDesc) {
      topGateDesc.innerText = 'Fechando Portão... ⏳';
      topGateDesc.style.color = '#f59e0b';
    }
    if (btnPulseGate) {
      btnPulseGate.disabled = true;
      btnPulseGate.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;margin-right:6px;"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11"/></svg> Fechando... ⏳';
    }
    if (camBarStatus) {
      camBarStatus.innerHTML = 'Fechando... ⏳';
      camBarStatus.style.color = '#f59e0b';
    }
    if (ptzGateStatus) {
      ptzGateStatus.innerHTML = 'Fechando... ⏳';
      ptzGateStatus.style.color = '#f59e0b';
    }
  } else {
    if (topGateBadge) {
      topGateBadge.innerText = isGateOpen ? '🚨 ABERTO' : '🔒 FECHADO';
      topGateBadge.className = isGateOpen ? 'badge badge-live' : 'badge badge-emerald';
    }
    if (topGateDesc) {
      topGateDesc.innerText = isGateOpen ? 'Portão Aberto 🚨' : 'Portão Fechado & Trancado 🔒';
      topGateDesc.style.color = isGateOpen ? 'var(--accent-rose)' : 'var(--accent-emerald)';
    }
    if (btnPulseGate) {
      btnPulseGate.disabled = false;
      btnPulseGate.innerHTML = isGateOpen 
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;margin-right:6px;"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11"/></svg> Fechar Portão 🚪'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;margin-right:6px;"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11"/></svg> Abrir Portão 🚪';
    }
    if (camBarStatus) {
      camBarStatus.innerHTML = isGateOpen ? 'Aberto 🚨' : 'Fechado 🔒';
      camBarStatus.style.color = isGateOpen ? '#fb7185' : '#34d399';
    }
    if (camBarIcon) camBarIcon.innerText = isGateOpen ? '🚨' : '🚪';
    if (ptzGateStatus) {
      ptzGateStatus.innerHTML = isGateOpen ? 'Aberto 🚨' : 'Fechado 🔒';
      ptzGateStatus.style.color = isGateOpen ? '#fb7185' : '#34d399';
    }
  }
}

function startGatePollingWatcher(devId) {
  if (gatePollingInterval) clearInterval(gatePollingInterval);
  gatePollCycles = 0;

  gatePollingInterval = setInterval(async () => {
    gatePollCycles++;
    try {
      const res = await fetch('/api/devices');
      if (res.ok) {
        devices = await res.json();
        const gateDev = devices.find(d => d.id === devId || d.category === 'ckmkzq' || (d.name && d.name.toLowerCase().includes('portão')));
        const confirmedOpen = gateDev && gateDev.live_dps ? (gateDev.live_dps['3'] === true || gateDev.live_dps['6'] === 'open') : false;

        if (window.gateTransitState === 'opening' && confirmedOpen) {
          clearInterval(gatePollingInterval);
          window.gateTransitState = null;
          updateGateUiState(true);
          renderQuickGrid();
          renderCustomShortcuts();
          showToast('Portão Aberto', 'O portão completou a abertura total!', '🚨', 'warning');
          return;
        }

        if (window.gateTransitState === 'closing' && !confirmedOpen) {
          clearInterval(gatePollingInterval);
          window.gateTransitState = null;
          updateGateUiState(false);
          renderQuickGrid();
          renderCustomShortcuts();
          showToast('Portão Fechado', 'Portão fechado e trancado com segurança!', '🔒', 'success');
          return;
        }

        updateGateUiState(confirmedOpen);
        renderQuickGrid();
        renderCustomShortcuts();
      }
    } catch (e) {}

    // Timeout de segurança após ~25 segundos (tempo máximo do percurso do motor)
    if (gatePollCycles >= 18) {
      clearInterval(gatePollingInterval);
      window.gateTransitState = null;
      const gateDev = devices.find(d => d.id === devId || d.category === 'ckmkzq' || (d.name && d.name.toLowerCase().includes('portão')));
      const confirmedOpen = gateDev && gateDev.live_dps ? (gateDev.live_dps['3'] === true || gateDev.live_dps['6'] === 'open') : false;
      updateGateUiState(confirmedOpen);
      renderQuickGrid();
      renderCustomShortcuts();
    }
  }, 1400);
}

// Pulso do Portão (Card Específico do Guia Rápido)
async function triggerGatePulse(devId, event) {
  if (event) event.stopPropagation();

  // Detecta estado atual do sensor magnético
  const gateDev = devices.find(d => d.id === devId || d.category === 'ckmkzq' || (d.name && d.name.toLowerCase().includes('portão')));
  const isCurrentlyOpen = gateDev && gateDev.live_dps ? (gateDev.live_dps['3'] === true || gateDev.live_dps['6'] === 'open') : false;

  // Define transição esperada
  const nextTransit = isCurrentlyOpen ? 'closing' : 'opening';
  window.gateTransitState = nextTransit;

  // Atualização instantânea da interface
  const btn = document.getElementById(`btnGateCardPulse-${devId}`);
  const btnText = document.getElementById(`btnGateCardText-${devId}`);
  const titleEl = document.getElementById(`gateSensorTitle-${devId}`);
  const subEl = document.getElementById(`gateSensorSub-${devId}`);
  const badgeEl = document.getElementById(`gateCardBadge-${devId}`);

  if (btn) btn.classList.add('is-pulsing');
  if (btnText) btnText.innerText = nextTransit === 'opening' ? 'Abrindo... ⏳' : 'Fechando... ⏳';
  if (titleEl) titleEl.innerText = nextTransit === 'opening' ? 'Abrindo Portão... ⏳' : 'Fechando Portão... ⏳';
  if (subEl) subEl.innerText = nextTransit === 'opening' ? 'Motor acionado • Aguardando curso de abertura' : 'Motor acionado • Aguardando fechamento total';
  if (badgeEl) {
    badgeEl.innerText = nextTransit === 'opening' ? 'ABRINDO' : 'FECHANDO';
    badgeEl.className = nextTransit === 'opening' ? 'badge badge-mode' : 'badge badge-warning';
  }

  updateGateUiState(isCurrentlyOpen);
  renderCustomShortcuts();
  showToast('Portão da Garagem', nextTransit === 'opening' ? 'Comando enviado! Abrindo portão...' : 'Comando enviado! Fechando portão...', '🚪', 'info');

  try {
    const res = await fetch('/api/gate/pulse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin: 'Portal Web (Card Dispositivo)' })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Portão da Garagem', 'Pulso de comando executado!', '✅', 'success');
    }
  } catch (err) {
    showToast('Erro no Portão', err.message, '🚨', 'danger');
  }

  startGatePollingWatcher(devId);
}

// Pulso do Portão (Card de Topo na Visão Geral e Câmeras)
async function pulseGate() {
  const gateDev = devices.find(d => d.category === 'ckmkzq' || (d.name && d.name.toLowerCase().includes('portão')));
  const isCurrentlyOpen = gateDev && gateDev.live_dps ? (gateDev.live_dps['3'] === true || gateDev.live_dps['6'] === 'open') : false;
  const nextTransit = isCurrentlyOpen ? 'closing' : 'opening';
  window.gateTransitState = nextTransit;

  updateGateUiState(isCurrentlyOpen);
  renderQuickGrid();
  renderCustomShortcuts();
  showToast('Portão da Garagem', nextTransit === 'opening' ? 'Acionando abertura do portão...' : 'Acionando fechamento do portão...', '🚪', 'info');

  try {
    const res = await fetch('/api/gate/pulse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin: 'Portal Web (Ação Rápida)' })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Portão da Garagem', 'Pulso executado!', '✅', 'success');
    }
  } catch (err) {
    showToast('Erro no Portão', err.message, '🚨', 'danger');
  }

  startGatePollingWatcher(gateDev ? gateDev.id : 'eb49c5d1977172327aqb1q');
}

// =============================================================
// CENTRAL DE NOTIFICAÇÕES & HISTÓRICO (LOGBOOK)
// =============================================================
let activityLogs = [];
let unreadNotifCount = 0;
let isNotifDropdownOpen = false;
let currentLogCategoryFilter = 'all';
let logSearchQuery = '';

function toggleNotifDropdown() {
  const dd = document.getElementById('notifDropdown');
  if (!dd) return;
  isNotifDropdownOpen = !isNotifDropdownOpen;
  dd.style.display = isNotifDropdownOpen ? 'block' : 'none';
  if (isNotifDropdownOpen) {
    renderNotifDropdown();
  }
}

// Fechar dropdown ao clicar fora
document.addEventListener('click', (e) => {
  const wrapper = document.querySelector('.notif-wrapper');
  if (wrapper && !wrapper.contains(e.target)) {
    const dd = document.getElementById('notifDropdown');
    if (dd) dd.style.display = 'none';
    isNotifDropdownOpen = false;
  }
});

let lastSeenDoorbellLogId = null;
let globalAudioCtx = null;

function getAudioContext() {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  if (!globalAudioCtx) {
    globalAudioCtx = new AudioCtx();
  }
  if (globalAudioCtx.state === 'suspended') {
    globalAudioCtx.resume().catch(() => {});
  }
  return globalAudioCtx;
}

window.addEventListener('click', () => {
  if (globalAudioCtx && globalAudioCtx.state === 'suspended') {
    globalAudioCtx.resume().catch(() => {});
  }
}, { passive: true });

function playDoorbellChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    
    // First tone (Ding - 660 Hz - E5)
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(659.25, now);
    gain1.gain.setValueAtTime(0, now);
    gain1.gain.linearRampToValueAtTime(0.5, now + 0.05);
    gain1.gain.exponentialRampToValueAtTime(0.001, now + 1.2);
    osc1.connect(gain1);
    gain1.connect(ctx.destination);
    osc1.start(now);
    osc1.stop(now + 1.2);

    // Second tone (Dong - 523.25 Hz - C5)
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(523.25, now + 0.38);
    gain2.gain.setValueAtTime(0, now + 0.38);
    gain2.gain.linearRampToValueAtTime(0.55, now + 0.43);
    gain2.gain.exponentialRampToValueAtTime(0.001, now + 2.0);
    osc2.connect(gain2);
    gain2.connect(ctx.destination);
    osc2.start(now + 0.38);
    osc2.stop(now + 2.0);
  } catch (e) {
    console.warn('Audio chime error:', e);
  }
}

async function triggerDoorbellTest() {
  playDoorbellChime();
  showDoorbellAlertBanner({
    timeFormatted: new Date().toLocaleTimeString('pt-BR'),
    action: 'Campainha Acionada 🔔'
  });
  try {
    await fetch('/api/doorbell/trigger', { method: 'POST' });
    fetchLogs();
  } catch (err) {}
}

function showDoorbellAlertBanner(item) {
  let banner = document.getElementById('floatingDoorbellBanner');
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'floatingDoorbellBanner';
    banner.className = 'floating-doorbell-alert';
    banner.style.cssText = 'position:fixed; top:24px; left:50%; transform:translateX(-50%); z-index:999999; background:linear-gradient(135deg,#0f172a,#1e293b); border:2px solid #0284c7; box-shadow:0 12px 35px rgba(2,132,199,0.45); border-radius:14px; padding:14px 20px; display:flex; align-items:center; gap:16px; min-width:340px; max-width:92vw; animation:bannerSlideDown 0.4s ease;';
    document.body.appendChild(banner);
  }
  const timeStr = item.timeFormatted || new Date().toLocaleTimeString('pt-BR');
  banner.innerHTML = `
    <div style="font-size:28px;">🔔</div>
    <div style="flex:1;">
      <div style="font-weight:700; font-size:14px; color:#fff; display:flex; align-items:center; gap:6px;">
        <span>CAMPAINHA ACIONADA!</span>
        <span class="badge badge-rose" style="font-size:10px; background:#e11d48; color:#fff; padding:2px 6px; border-radius:6px;">AO VIVO</span>
      </div>
      <div style="font-size:12px; color:#cbd5e1; margin-top:2px;">
        Visitante tocou a campainha da entrada às <strong>${timeStr}</strong>
      </div>
    </div>
    <div style="display:flex; gap:6px; align-items:center;">
      <button class="btn btn-sm btn-primary" onclick="openEntranceCameraFromDoorbell()" style="background:#0284c7; color:#fff; border:none; font-weight:600; padding:6px 12px; border-radius:8px; cursor:pointer;">👀 Ver Câmera Entrada</button>
      <button class="btn btn-sm btn-secondary" onclick="dismissDoorbellBanner()" style="padding:6px 10px; border-radius:8px; cursor:pointer;">✕</button>
    </div>
  `;
  banner.style.display = 'flex';

  if (window.Notification && Notification.permission === 'granted') {
    try {
      new Notification('🔔 Campainha Residencial Acionada!', {
        body: `Visitante na entrada da residência (${timeStr}). Clique para visualizar.`,
        icon: '/favicon.ico'
      });
    } catch {}
  } else if (window.Notification && Notification.permission === 'default') {
    try { Notification.requestPermission(); } catch {}
  }
}

function dismissDoorbellBanner() {
  const banner = document.getElementById('floatingDoorbellBanner');
  if (banner) banner.style.display = 'none';
}

function openEntranceCameraFromDoorbell() {
  dismissDoorbellBanner();
  switchTab('cameras');
  const cam = (window._cachedCameras || []).find(c => c.id === 'outdoor_pro_poste' || c.id === 'aw300_portao');
  if (cam) {
    openCameraTheater(cam.id, cam.name);
  }
}

async function fetchLogs() {
  try {
    const res = await fetch('/api/logs');
    const data = await res.json();
    activityLogs = data.logs || [];
    unreadNotifCount = data.unreadCount || 0;

    // Detecção ativa e instantânea de Campainha
    const unreadDoorbell = activityLogs.find(l => 
      !l.read && 
      (l.devId === 'eb7f7b175bf04774f0qnwh' || 
       (l.devName && l.devName.toLowerCase().includes('campan')) || 
       (l.action && l.action.toLowerCase().includes('campainha')))
    );

    if (unreadDoorbell && unreadDoorbell.id !== lastSeenDoorbellLogId) {
      lastSeenDoorbellLogId = unreadDoorbell.id;
      playDoorbellChime();
      showDoorbellAlertBanner(unreadDoorbell);
    }

    // Atualiza badges no cabeçalho
    const notifBadge = document.getElementById('notifBadge');
    if (notifBadge) {
      if (unreadNotifCount > 0) {
        notifBadge.style.display = 'flex';
        notifBadge.innerText = unreadNotifCount > 99 ? '99+' : unreadNotifCount;
      } else {
        notifBadge.style.display = 'none';
      }
    }

    const unreadPill = document.getElementById('notifUnreadCountBadge');
    if (unreadPill) unreadPill.innerText = `${unreadNotifCount} novas`;

    const tabBadge = document.getElementById('tabLogsBadge');
    if (tabBadge) tabBadge.innerText = activityLogs.length;

    const totalBadge = document.getElementById('logTotalCount');
    if (totalBadge) totalBadge.innerText = activityLogs.length;

    if (isNotifDropdownOpen) renderNotifDropdown();
    renderLogbook();
  } catch (err) {
    console.error('Erro ao buscar logs:', err);
  }
}

function renderNotifDropdown() {
  const list = document.getElementById('notifDropdownList');
  if (!list) return;

  if (activityLogs.length === 0) {
    list.innerHTML = `<div class="notif-empty">Nenhuma atividade recente registrada.</div>`;
    return;
  }

  const recent = activityLogs.slice(0, 10);
  list.innerHTML = recent.map(item => `
    <div class="notif-item ${item.read ? '' : 'unread'}" onclick="goToLogsTab()">
      <div class="notif-item-icon">${item.icon || '⚡'}</div>
      <div class="notif-item-content">
        <div class="notif-item-top">
          <div class="notif-item-title">${item.devName}</div>
          <div class="notif-item-time">${item.timeFormatted}</div>
        </div>
        <div class="notif-item-desc">${item.action} — ${item.details || ''}</div>
      </div>
    </div>
  `).join('');
}

async function markAllNotificationsAsRead() {
  try {
    await fetch('/api/logs/mark-read', { method: 'POST' });
    unreadNotifCount = 0;
    activityLogs.forEach(l => l.read = true);
    const notifBadge = document.getElementById('notifBadge');
    if (notifBadge) notifBadge.style.display = 'none';
    const unreadPill = document.getElementById('notifUnreadCountBadge');
    if (unreadPill) unreadPill.innerText = '0 novas';
    renderNotifDropdown();
    renderLogbook();
    showToast('Notificações', 'Todas as notificações foram marcadas como lidas.', '✓', 'info');
  } catch (e) {
    console.error('Erro ao marcar lidas:', e);
  }
}

async function clearActivityLogs() {
  if (!confirm('Deseja realmente limpar todo o histórico de atividades da residência?')) return;
  try {
    await fetch('/api/logs/clear', { method: 'POST' });
    activityLogs = [];
    unreadNotifCount = 0;
    fetchLogs();
    showToast('Histórico Limpo', 'Todos os registros foram excluídos com sucesso.', '🗑️', 'info');
  } catch (e) {
    alert('Erro ao limpar logs: ' + e.message);
  }
}

function goToLogsTab() {
  const dd = document.getElementById('notifDropdown');
  if (dd) dd.style.display = 'none';
  isNotifDropdownOpen = false;

  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  const btn = document.querySelector('.tab-btn[data-tab="logs"]');
  const content = document.getElementById('tab-logs');
  if (btn) btn.classList.add('active');
  if (content) content.classList.add('active');

  renderLogbook();
}

function filterLogsByCategory(category) {
  currentLogCategoryFilter = category;
  document.querySelectorAll('#logCategoryBar .log-pill-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.filter === category);
  });
  renderLogbook();
}

function handleLogSearchInput(val) {
  logSearchQuery = (val || '').trim().toLowerCase();
  renderLogbook();
}

function renderLogbook() {
  const feed = document.getElementById('logbookFeed');
  if (!feed) return;

  let filtered = activityLogs.filter(item => {
    const textMatch = !logSearchQuery || (
      (item.devName || '').toLowerCase().includes(logSearchQuery) ||
      (item.action || '').toLowerCase().includes(logSearchQuery) ||
      (item.details || '').toLowerCase().includes(logSearchQuery) ||
      (item.origin || '').toLowerCase().includes(logSearchQuery) ||
      (item.timeFormatted || '').toLowerCase().includes(logSearchQuery)
    );

    if (!textMatch) return false;

    if (currentLogCategoryFilter === 'all') return true;
    if (currentLogCategoryFilter === 'gate') {
      return (item.devName || '').toLowerCase().includes('portão') || item.icon === '🚪';
    }
    if (currentLogCategoryFilter === 'lights') {
      return (item.devName || '').toLowerCase().includes('luz') || (item.devName || '').toLowerCase().includes('interruptor') || item.icon === '💡';
    }
    if (currentLogCategoryFilter === 'energy') {
      return (item.devName || '').toLowerCase().includes('byd') || (item.devName || '').toLowerCase().includes('wattímetro') || (item.devName || '').toLowerCase().includes('disjuntor') || item.icon === '⚡';
    }
    if (currentLogCategoryFilter === 'timer') {
      return (item.action || '').toLowerCase().includes('timer') || (item.action || '').toLowerCase().includes('temporizador') || (item.origin || '').toLowerCase().includes('timer') || item.icon === '⏱️';
    }
    if (currentLogCategoryFilter === 'alarm') {
      return item.level === 'warning' || item.level === 'alarm';
    }
    return true;
  });

  if (filtered.length === 0) {
    feed.innerHTML = `
      <div style="text-align: center; color: var(--text-dim); padding: 50px 20px; background: rgba(15,23,42,0.5); border-radius: var(--radius-md); border: 1px dashed var(--border);">
        <p style="font-size: 15px; margin-bottom: 6px;">Nenhum evento registrado com os filtros atuais.</p>
        <small style="color: var(--text-dim);">Execute ações nos dispositivos ou alterne o filtro de categoria.</small>
      </div>
    `;
    return;
  }

  feed.innerHTML = filtered.map(item => {
    const levelClass = item.level === 'success' ? 'level-success' : (item.level === 'warning' ? 'level-warning' : (item.level === 'alarm' ? 'level-alarm' : ''));
    const badgeLevelClass = item.level === 'success' ? 'badge-success' : (item.level === 'warning' ? 'badge-warning' : (item.level === 'alarm' ? 'badge-alarm' : ''));

    return `
      <div class="log-item">
        <div class="log-item-left">
          <div class="log-item-icon ${levelClass}">
            ${item.icon || '⚡'}
          </div>
          <div class="log-item-text">
            <div class="log-item-header-row">
              <span class="log-item-dev-name">${item.devName}</span>
              <span class="log-item-action-badge ${badgeLevelClass}">${item.action}</span>
            </div>
            <div class="log-item-details">${item.details || 'Ação registrada na central'}</div>
          </div>
        </div>
        <div class="log-item-right">
          <span class="log-item-time">${item.timeFormatted}</span>
          <span class="log-item-origin-pill">${item.origin || 'Portal Web'}</span>
        </div>
      </div>
    `;
  }).join('');
}

// -------------------------------------------------------------
// Câmeras Xiaomi & Multiview Integrado (PTZ, Áudio & Atalhos)
// -------------------------------------------------------------
let camerasLoadedOnce = false;
let currentCameraLayout = 'grid';
let activePtzCam = null;
let isAudioListening = false;
let isPttTalking = false;

// Foco Único personalizável: câmera em destaque, ordem das demais e posição do destaque (lado ou acima).
let cameraFocusPrefs = (() => { try { return JSON.parse(localStorage.getItem('mizin_cam_focus') || 'null') || {}; } catch { return {}; } })();
function saveCameraFocusPrefs() {
  try { localStorage.setItem('mizin_cam_focus', JSON.stringify(cameraFocusPrefs)); } catch {}
  syncSaveUiConfig({ cameraFocus: cameraFocusPrefs });
}
function applyCameraFocus() {
  const grid = document.getElementById('camerasGrid');
  if (!grid) return;
  const cards = [...grid.querySelectorAll('.camera-card[data-cam-id]')];
  const ids = cards.map(c => c.dataset.camId);
  const saved = (cameraFocusPrefs.order || []).filter(id => ids.includes(id));
  const order = [...saved, ...ids.filter(id => !saved.includes(id))];
  const focus = ids.includes(cameraFocusPrefs.focus) ? cameraFocusPrefs.focus : order[0];
  const focusMode = currentCameraLayout === 'focus';
  grid.classList.toggle('focus-top', focusMode && cameraFocusPrefs.position === 'top');
  for (const card of cards) {
    const isFocus = focusMode && card.dataset.camId === focus;
    card.classList.toggle('is-focus', isFocus);
    card.style.order = focusMode ? (isFocus ? -1 : order.indexOf(card.dataset.camId)) : '';
  }
  const customize = document.getElementById('btnCustomizeFocus');
  if (customize) customize.style.display = focusMode ? '' : 'none';
}
function openCameraFocusSettings() {
  const cams = window._cachedCameras || [];
  if (!cams.length) return;
  const saved = (cameraFocusPrefs.order || []).filter(id => cams.some(c => c.id === id));
  const order = [...saved, ...cams.map(c => c.id).filter(id => !saved.includes(id))];
  let focus = cams.some(c => c.id === cameraFocusPrefs.focus) ? cameraFocusPrefs.focus : order[0];
  let position = cameraFocusPrefs.position === 'top' ? 'top' : 'side';
  const name = id => cams.find(c => c.id === id)?.name || id;
  const dialog = document.createElement('dialog');
  dialog.className = 'focus-settings-dialog';
  const render = () => {
    dialog.innerHTML = `
      <div class="focus-settings-head"><h3>Personalizar Foco Único</h3><button type="button" class="btn-close" data-act="close" title="Fechar">&times;</button></div>
      <p class="focus-settings-hint">Escolha a câmera em destaque e a ordem das demais.</p>
      <div class="focus-settings-position">
        <span>Destaque:</span>
        <button type="button" class="sd-event-tab${position === 'side' ? ' active' : ''}" data-act="side">◧ Grande à esquerda</button>
        <button type="button" class="sd-event-tab${position === 'top' ? ' active' : ''}" data-act="top">⬒ Largura total acima</button>
      </div>
      <ol class="focus-settings-list">${order.map((id, i) => `
        <li class="${id === focus ? 'is-focus' : ''}">
          <label><input type="radio" name="focusCam" value="${id}" ${id === focus ? 'checked' : ''}> ${name(id)}</label>
          <span><button type="button" data-act="up" data-i="${i}" ${i === 0 ? 'disabled' : ''} title="Subir">▲</button><button type="button" data-act="down" data-i="${i}" ${i === order.length - 1 ? 'disabled' : ''} title="Descer">▼</button></span>
        </li>`).join('')}</ol>
      <div class="focus-settings-actions"><button type="button" class="btn btn-secondary btn-sm" data-act="close">Cancelar</button><button type="button" class="btn btn-primary btn-sm" data-act="save">Salvar</button></div>`;
  };
  dialog.addEventListener('change', e => { if (e.target.name === 'focusCam') { focus = e.target.value; render(); } });
  dialog.addEventListener('click', e => {
    const target = e.target.closest('[data-act]');
    if (!target) return;
    const act = target.dataset.act, i = Number(target.dataset.i);
    if (act === 'close') dialog.close();
    if (act === 'side' || act === 'top') { position = act; render(); }
    if (act === 'up' || act === 'down') { const j = act === 'up' ? i - 1 : i + 1; [order[i], order[j]] = [order[j], order[i]]; render(); }
    if (act === 'save') { cameraFocusPrefs = { focus, order, position }; saveCameraFocusPrefs(); applyCameraFocus(); dialog.close(); showToast('Foco Único personalizado ✅', 'success'); }
  });
  dialog.addEventListener('close', () => dialog.remove());
  render();
  document.body.append(dialog);
  dialog.showModal();
}

function setCameraLayout(mode) {
  currentCameraLayout = mode;
  document.querySelectorAll('.cam-mode-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = document.getElementById(mode === '2x2' ? 'btnMode2x2' : (mode === 'focus' ? 'btnModeFocus' : 'btnModeGrid'));
  if (activeBtn) activeBtn.classList.add('active');

  const grid = document.getElementById('camerasGrid');
  if (grid) {
    grid.className = 'cameras-grid layout-' + mode;
  }
  applyCameraFocus();
  showToast(`Modo de exibição: ${mode === '2x2' ? 'Multiview 2x2' : (mode === 'focus' ? 'Foco Único' : 'Grade Padrão')}`);
}

function refreshCameraFeeds() {
  showToast('Atualizando feeds ao vivo de todas as câmeras...');
  fetchCameras();
}

async function quickToggleLight(devId, dps = 1) {
  const targetDev = devices.find(d => d.id === devId || d.local_ip === devId);
  const devName = targetDev ? targetDev.name : 'Iluminação';
  const currentVal = targetDev && targetDev.live_dps ? Boolean(targetDev.live_dps[String(dps)]) : false;
  const targetVal = !currentVal;

  showToast(`${targetVal ? 'Acendendo' : 'Apagando'} ${devName}...`);
  try {
    await fetch(`/api/device/${devId}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dps, value: targetVal })
    });
    if (targetDev && targetDev.live_dps) targetDev.live_dps[String(dps)] = targetVal;
    renderQuickGrid();
    showToast(`${devName}: ${targetVal ? 'LIGADA 💡' : 'APAGADA 🌙'}`);
    fetchDevices();
  } catch (e) {
    alert('Erro ao acionar luz: ' + e.message);
  }
}

// =============================================================
// SISTEMA DE ATALHOS RÁPIDOS PERSONALIZADOS DA RESIDÊNCIA
// =============================================================
const DEFAULT_SHORTCUTS = [
  {
    id: 'sc_gate',
    name: 'Acionar Portão',
    icon: '🚪',
    type: 'gate',
    targetId: 'eb49c5d1977172327aqb1q',
    channel: 1,
    action: 'pulse',
    showOverview: true,
    showCameras: true,
    showPopup: true
  },
  {
    id: 'sc_all_off',
    name: 'Apagar Todas as Luzes',
    icon: '🌙',
    type: 'scene_all_off',
    targetId: null,
    channel: null,
    action: 'turn_off_all',
    showOverview: true,
    showCameras: false,
    showPopup: true
  },
  {
    id: 'sc_main_on',
    name: 'Acender Principais',
    icon: '💡',
    type: 'scene_main_on',
    targetId: null,
    channel: null,
    action: 'turn_on_all',
    showOverview: true,
    showCameras: false,
    showPopup: false
  },
  {
    id: 'sc_light_garage',
    name: 'Luz Garagem',
    icon: '💡',
    type: 'device',
    targetId: 'eb49c5d1977172327aqb1q',
    channel: 1,
    action: 'toggle',
    showOverview: true,
    showCameras: true,
    showPopup: true
  },
  {
    id: 'sc_light_street',
    name: 'Luz da Rua',
    icon: '💡',
    type: 'device',
    targetId: 'ebe317c237358405b8h5n8',
    channel: 1,
    action: 'toggle',
    showOverview: true,
    showCameras: true,
    showPopup: true
  },
  {
    id: 'sc_light_living',
    name: 'Luz da Sala',
    icon: '💡',
    type: 'device',
    targetId: 'eb6227b63a58b256579aim',
    channel: 1,
    action: 'toggle',
    showOverview: true,
    showCameras: true,
    showPopup: true
  },
  {
    id: 'sc_byd_breaker',
    name: 'Disjuntor Wallbox BYD',
    icon: '⚡',
    type: 'byd',
    targetId: 'ebb5f986e16519ef82o3oa',
    channel: 16,
    action: 'toggle',
    showOverview: true,
    showCameras: false,
    showPopup: true
  },
  {
    id: 'sc_ac_power',
    name: 'Ar Condicionado',
    icon: '❄️',
    type: 'ac',
    targetId: 'eb786ebb970e6a20ffj0ls',
    channel: 1,
    action: 'toggle',
    showOverview: true,
    showCameras: false,
    showPopup: false
  },
  {
    id: 'sc_logs',
    name: 'Registro Atividades',
    icon: '📋',
    type: 'nav',
    targetId: 'logs',
    channel: null,
    action: 'nav',
    showOverview: true,
    showCameras: false,
    showPopup: false
  }
];

function getCustomShortcuts() {
  try {
    const raw = localStorage.getItem('mizin_custom_shortcuts');
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS));
}

function saveCustomShortcuts(list) {
  try {
    localStorage.setItem('mizin_custom_shortcuts', JSON.stringify(list));
  } catch (e) {}
  syncSaveUiConfig({ shortcuts: list });
}

function getShortcutStatus(sc) {
  if (sc.type === 'gate') {
    const gateDev = devices.find(d => d.category === 'ckmkzq' || (d.name && d.name.toLowerCase().includes('portão')));
    let isOpen = false;
    if (gateDev && gateDev.live_dps) {
      isOpen = gateDev.live_dps['3'] === true || gateDev.live_dps['6'] === 'open';
    }
    if (window.gateTransitState === 'opening') {
      return { text: 'Abrindo... ⏳', color: '#38bdf8', bg: 'rgba(56,189,248,0.15)', rawState: 'opening' };
    }
    if (window.gateTransitState === 'closing') {
      return { text: 'Fechando... ⏳', color: '#fbbf24', bg: 'rgba(245,158,11,0.15)', rawState: 'closing' };
    }
    return isOpen 
      ? { text: 'Aberto 🚨', color: '#fb7185', bg: 'rgba(244,63,94,0.12)', rawState: 'open' }
      : { text: 'Fechado 🔒', color: '#34d399', bg: 'rgba(16,185,129,0.12)', rawState: 'closed' };
  }

  if (sc.type === 'scene_all_off') {
    let count = 0;
    devices.forEach(d => {
      const isLight = d.category === 'kg' || d.category === 'dj' || (d.name && d.name.toLowerCase().includes('luz'));
      if (isLight && d.live_dps && (d.live_dps['1'] || d.live_dps['2'] || d.is_on)) count++;
    });
    return count > 0
      ? { text: `${count} Acesas`, color: '#fbbf24', bg: 'rgba(245,158,11,0.12)', rawState: count }
      : { text: 'Apagadas', color: '#94a3b8', bg: 'rgba(255,255,255,0.05)', rawState: 0 };
  }

  if (sc.type === 'scene_main_on') {
    return { text: 'Acender 💡', color: '#38bdf8', bg: 'rgba(56,189,248,0.12)', rawState: 'action' };
  }

  if (sc.type === 'byd') {
    const bydDev = devices.find(d => d.name && d.name.toLowerCase().includes('byd'));
    const isArmed = bydDev && bydDev.live_dps ? (bydDev.live_dps['16'] ?? true) : true;
    return isArmed
      ? { text: 'Armada ⚡', color: '#34d399', bg: 'rgba(16,185,129,0.12)', rawState: true }
      : { text: 'Desarmada 🛑', color: '#94a3b8', bg: 'rgba(255,255,255,0.05)', rawState: false };
  }

  if (sc.type === 'ac') {
    const acDev = devices.find(d => d.category === 'infrared_ac' || (d.name && d.name.toLowerCase().includes('ar mizin')));
    const isOn = acDev && acDev.live_dps ? Boolean(acDev.live_dps['1']) : false;
    return isOn
      ? { text: 'Ligado ❄️', color: '#38bdf8', bg: 'rgba(56,189,248,0.12)', rawState: true }
      : { text: 'Standby ⚪', color: '#94a3b8', bg: 'rgba(255,255,255,0.05)', rawState: false };
  }

  if (sc.type === 'nav') {
    return { text: 'Acessar ↗️', color: '#38bdf8', bg: 'rgba(56,189,248,0.1)', rawState: 'nav' };
  }

  if (sc.type === 'device') {
    const targetDev = devices.find(d => d.id === sc.targetId || d.local_ip === sc.targetId);
    if (!targetDev) {
      return { text: 'Dispositivo', color: '#94a3b8', bg: 'rgba(255,255,255,0.05)', rawState: 'unknown' };
    }
    const ch = String(sc.channel || 1);
    const isOn = Boolean(targetDev.live_dps && targetDev.live_dps[ch]);
    return isOn
      ? { text: 'Ligada 💡', color: '#fbbf24', bg: 'rgba(245,158,11,0.15)', rawState: true }
      : { text: 'Desligada ⚪', color: '#94a3b8', bg: 'rgba(255,255,255,0.05)', rawState: false };
  }

  return { text: 'OK', color: '#38bdf8', bg: 'rgba(56,189,248,0.1)', rawState: 'ok' };
}

function renderCustomShortcuts() {
  const shortcuts = getCustomShortcuts();

  // 1. Painel Inicial (Visão Geral)
  const overviewContainer = document.getElementById('haOverviewShortcutsContainer');
  if (overviewContainer) {
    const overviewList = shortcuts.filter(s => s.showOverview !== false);
    overviewContainer.innerHTML = overviewList.map(sc => {
      const status = getShortcutStatus(sc);
      return `
        <button class="ha-shortcut-pill" onclick="executeShortcut('${sc.id}')" title="${sc.name}">
          <span>${sc.icon || '⚡'}</span>
          <span>${sc.name}</span>
          <span class="sc-status-badge" style="color: ${status.color}; background: ${status.bg}; border-color: ${status.color}40;">${status.text}</span>
        </button>
      `;
    }).join('');
  }

  // 2. Barra Superior das Câmeras
  const camContainer = document.getElementById('haCameraShortcutsContainer');
  if (camContainer) {
    const camList = shortcuts.filter(s => s.showCameras !== false);
    camContainer.innerHTML = camList.map(sc => {
      const status = getShortcutStatus(sc);
      return `
        <button class="cam-quick-action-btn" onclick="executeShortcut('${sc.id}')" title="${sc.name}">
          <span>${sc.icon || '⚡'}</span>
          <span>${sc.name}</span>
          <span class="sc-status-badge" style="color: ${status.color}; background: ${status.bg}; border: 1px solid ${status.color}40; font-size: 10px; padding: 2px 5px; border-radius: 4px; margin-left: 4px;">${status.text}</span>
        </button>
      `;
    }).join('');
  }

  // 3. Popup / Modal da Câmera
  const popupContainer = document.getElementById('ptzModalShortcutsContainer');
  if (popupContainer) {
    const popupList = shortcuts.filter(s => s.showPopup !== false);
    popupContainer.innerHTML = popupList.map(sc => {
      const status = getShortcutStatus(sc);
      return `
        <button class="btn btn-secondary btn-sm" onclick="executeShortcut('${sc.id}')" style="justify-content:space-between; width:100%; padding:7px 10px; font-size:12px;">
          <span style="display:flex; align-items:center; gap:6px;">
            <span>${sc.icon || '⚡'}</span>
            <strong>${sc.name}</strong>
          </span>
          <span style="color: ${status.color}; font-weight:700; font-size:11px;">${status.text}</span>
        </button>
      `;
    }).join('');
  }
}

async function executeShortcut(scId) {
  const shortcuts = getCustomShortcuts();
  const sc = shortcuts.find(s => s.id === scId);
  if (!sc) return;

  const currentStatus = getShortcutStatus(sc);

  // Execução com verificação prévia de status
  if (sc.type === 'gate') {
    showToast(`[Portão]: Status atual é "${currentStatus.text}". Enviando comando de pulso...`);
    await pulseGate();
    return;
  }

  if (sc.type === 'scene_all_off') {
    if (currentStatus.rawState === 0) {
      showToast('Todas as luzes da residência já estão apagadas! 🌙');
      return;
    }
    showToast(`Apagando todas as ${currentStatus.rawState} luzes ativas...`);
    await turnOffAllLights();
    return;
  }

  if (sc.type === 'scene_main_on') {
    showToast('Acendendo luzes principais da residência... 💡');
    await turnOnAllLights();
    return;
  }

  if (sc.type === 'byd') {
    showToast(`Disjuntor Wallbox BYD está ${currentStatus.text}. Alternando estado...`);
    await quickToggleBydBreaker();
    return;
  }

  if (sc.type === 'ac') {
    showToast(`Ar Condicionado está ${currentStatus.text}. Alternando...`);
    await quickToggleAc();
    return;
  }

  if (sc.type === 'nav') {
    switchTab(sc.targetId);
    return;
  }

  if (sc.type === 'device') {
    const targetDev = devices.find(d => d.id === sc.targetId || d.local_ip === sc.targetId);
    if (!targetDev) {
      alert('Dispositivo não encontrado.');
      return;
    }
    const ch = sc.channel || 1;
    const currentVal = Boolean(targetDev.live_dps && targetDev.live_dps[String(ch)]);
    let targetVal = !currentVal;

    if (sc.action === 'turn_on') targetVal = true;
    if (sc.action === 'turn_off') targetVal = false;
    if (sc.action === 'pulse') {
      showToast(`Enviando pulso para ${sc.name}...`);
      await fetch(`/api/device/${targetDev.id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dps: ch, value: true })
      });
      setTimeout(() => {
        fetch(`/api/device/${targetDev.id}/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dps: ch, value: false })
        });
        fetchDevices();
      }, 800);
      return;
    }

    showToast(`${targetDev.name}: Status atual [${currentVal ? 'Ligada' : 'Desligada'}]. Alterando para [${targetVal ? 'Ligar' : 'Desligar'}]...`);
    try {
      await fetch(`/api/device/${targetDev.id}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dps: ch, value: targetVal })
      });
      if (targetDev.live_dps) targetDev.live_dps[String(ch)] = targetVal;
      renderCustomShortcuts();
      renderQuickGrid();
      fetchDevices();
    } catch (e) {
      alert('Erro ao executar atalho: ' + e.message);
    }
  }
}

// =============================================================
// RENDERIZAÇÃO DINÂMICA DOS GLANCE BADGES (LOVELACE HOME ASSISTANT)
// =============================================================
function renderGlanceBar() {
  const container = document.getElementById('haGlanceBarContainer');
  if (!container) return;

  if (appUiConfig.showGlanceBar === false) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'flex';

  const badges = appUiConfig.glanceBadges || [];
  const activeBadges = badges.filter(b => b.enabled !== false);

  if (activeBadges.length === 0) {
    container.style.display = 'none';
    return;
  }

  // 1. Contador de Luzes Acesas
  let lightsOnCount = 0;
  devices.forEach(d => {
    const isLight = d.category === 'kg' || d.category === 'dj' || (d.name && d.name.toLowerCase().includes('luz'));
    if (isLight) {
      const dps = d.live_dps || {};
      if (dps['1'] || dps['2'] || d.is_on) lightsOnCount++;
    }
  });

  // 2. Sensor do Portão
  const gateDev = devices.find(d => d.category === 'ckmkzq' || (d.name && d.name.toLowerCase().includes('portão')));
  let isGateOpen = false;
  if (gateDev && gateDev.live_dps) {
    isGateOpen = gateDev.live_dps['3'] === true || gateDev.live_dps['6'] === 'open';
  }

  // 3. Wallbox BYD
  const bydDev = devices.find(d => d.name && d.name.toLowerCase().includes('byd'));
  let isBydOn = true;
  if (bydDev && bydDev.live_dps) {
    isBydOn = bydDev.live_dps['16'] ?? true;
  }

  // 4. Ar Condicionado
  const acDev = devices.find(d => d.category === 'infrared_ac' || (d.name && d.name.toLowerCase().includes('ar mizin')));
  let isAcOn = false;
  if (acDev && acDev.live_dps) {
    isAcOn = Boolean(acDev.live_dps['1']);
  }

  // 5. Telemetria de Rede (Watts & Amperes)
  const homeWatts = document.getElementById('metricHomeWatts')?.innerText || '235';
  const homeAmps = document.getElementById('metricHomeTotalAmps')?.innerText?.split(' ')[0] || '2.37';

  const html = activeBadges.map(badge => {
    const bId = badge.id || '';
    const type = badge.type || bId.replace('gb_', '').replace('glance_', '');

    if (type === 'lights') {
      if (lightsOnCount > 0) {
        return `
          <div class="ha-glance-chip is-clickable active-amber" onclick="turnOffAllLights()" title="Toque para apagar todas as ${lightsOnCount} luzes acesas">
            <span class="morph-icon morph-glow-amber">💡</span>
            <span><strong style="color:#fbbf24;">${lightsOnCount} ${lightsOnCount === 1 ? 'Luz Acesa' : 'Luzes Acesas'}</strong> (Toque p/ Apagar)</span>
          </div>
        `;
      } else {
        return `
          <div class="ha-glance-chip is-clickable" onclick="switchTab('overview')" title="Todas as luzes estão apagadas">
            <span class="morph-icon">💡</span>
            <span>Luzes: Todas Apagadas</span>
          </div>
        `;
      }
    }

    if (type === 'gate') {
      if (isGateOpen) {
        return `
          <div class="ha-glance-chip is-clickable active-rose" onclick="pulseGate()" title="Portão Aberto! Toque para fechar">
            <span class="morph-icon morph-glow-rose">🚨</span>
            <span><strong style="color:#fb7185;">Portão Aberto 🚨</strong></span>
          </div>
        `;
      } else {
        return `
          <div class="ha-glance-chip is-clickable active-emerald" onclick="pulseGate()" title="Portão Fechado. Toque para acionar">
            <span class="morph-icon morph-glow-emerald">🔒</span>
            <span>Portão: <span style="color:#34d399;">Fechado 🔒</span></span>
          </div>
        `;
      }
    }

    if (type === 'byd') {
      return `
        <div class="ha-glance-chip is-clickable ${isBydOn ? 'active-emerald' : ''}" onclick="quickToggleBydBreaker()" title="Toque para alternar o disjuntor da Wallbox BYD">
          <span class="morph-icon ${isBydOn ? 'morph-glow-emerald' : ''}">🚗</span>
          <span>BYD: ${isBydOn ? '<span style="color:#34d399;">Armada ⚡</span>' : '<span style="color:var(--text-dim);">Desarmada 🛑</span>'}</span>
        </div>
      `;
    }

    if (type === 'ac') {
      return `
        <div class="ha-glance-chip is-clickable ${isAcOn ? 'active-amber' : ''}" onclick="quickToggleAc()" title="Toque para alternar o Ar Condicionado">
          <span class="morph-icon ${isAcOn ? 'morph-spin-slow' : ''}">❄️</span>
          <span>Ar: ${isAcOn ? '<span style="color:#38bdf8;">Ligado ❄️</span>' : 'Standby'}</span>
        </div>
      `;
    }

    if (type === 'energy' || type === 'grid') {
      return `
        <div class="ha-glance-chip is-clickable" onclick="openEnergyDetailsModal('home')" title="Toque para abrir telemetria da Rede CEEE">
          <span class="morph-icon morph-pulse" style="color:var(--accent-amber);">⚡</span>
          <span>Rede: <strong>${homeWatts} W</strong> • ${homeAmps} A</span>
        </div>
      `;
    }

    if (type === 'generator') {
      return `
        <div class="ha-glance-chip is-clickable" onclick="openEnergyDetailsModal('generator')" title="Toque para telemetria do Gerador Residencial">
          <span class="morph-icon">⚙️</span>
          <span>Gerador: Standby</span>
        </div>
      `;
    }

    if (type === 'cameras') {
      return `
        <div class="ha-glance-chip is-clickable" onclick="switchTab('cameras')" title="Ver Central de Câmeras">
          <span class="morph-icon">📹</span>
          <span>Câmeras Xiaomi</span>
        </div>
      `;
    }

    // Default badge
    return `
      <div class="ha-glance-chip is-clickable" onclick="switchTab('overview')">
        <span class="morph-icon">${badge.icon || '🏷️'}</span>
        <span>${badge.name}</span>
      </div>
    `;
  }).join('');

  container.innerHTML = html;
}

// -------------------------------------------------------------
// Gerenciamento e Personalização dos Atalhos & Badges (Modal)
// -------------------------------------------------------------
function switchCustomizeSubTab(tab) {
  const btnShortcuts = document.getElementById('tabBtnShortcuts');
  const btnGlance = document.getElementById('tabBtnGlance');
  const secShortcuts = document.getElementById('customSectionShortcuts');
  const secGlance = document.getElementById('customSectionGlance');

  if (tab === 'shortcuts') {
    if (btnShortcuts) btnShortcuts.classList.add('active');
    if (btnGlance) btnGlance.classList.remove('active');
    if (secShortcuts) secShortcuts.style.display = 'block';
    if (secGlance) secGlance.style.display = 'none';
    renderManageShortcutsList();
  } else {
    if (btnShortcuts) btnShortcuts.classList.remove('active');
    if (btnGlance) btnGlance.classList.add('active');
    if (secShortcuts) secShortcuts.style.display = 'none';
    if (secGlance) secGlance.style.display = 'block';
    renderGlanceManageList();
  }
}

function renderGlanceManageList() {
  const listEl = document.getElementById('glanceManageList');
  const chkShow = document.getElementById('chkShowGlanceBar');
  if (chkShow) chkShow.checked = appUiConfig.showGlanceBar !== false;
  if (!listEl) return;

  const badges = appUiConfig.glanceBadges || [];
  if (badges.length === 0) {
    listEl.innerHTML = '<div style="color:var(--text-dim); text-align:center; padding:16px;">Nenhum badge configurado.</div>';
    return;
  }

  listEl.innerHTML = badges.map((badge, idx) => {
    const isChecked = badge.enabled !== false;
    return `
      <div class="shortcut-manage-row" style="display:flex; justify-content:space-between; align-items:center; padding:10px 14px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:8px; margin-bottom:8px;">
        <div style="display:flex; align-items:center; gap:12px;">
          <input type="checkbox" id="chkGlance_${badge.id}" ${isChecked ? 'checked' : ''} onchange="toggleGlanceBadge('${badge.id}', this.checked)" style="width:18px; height:18px; cursor:pointer;">
          <span style="font-size:20px;">${badge.icon || '🏷️'}</span>
          <div>
            <strong style="color:var(--text-main); font-size:13px; display:block;">${badge.name}</strong>
            <span style="font-size:11px; color:var(--text-dim);">${isChecked ? '✅ Exibido no topo' : '❌ Oculto'}</span>
          </div>
        </div>
        <div style="display:flex; gap:4px;">
          ${idx > 0 ? `<button class="btn-icon-action" onclick="moveGlanceBadge('${badge.id}', -1)" title="Mover para Esquerda/Cima">⬆️</button>` : ''}
          ${idx < badges.length - 1 ? `<button class="btn-icon-action" onclick="moveGlanceBadge('${badge.id}', 1)" title="Mover para Direita/Baixo">⬇️</button>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

function toggleShowGlanceBar(checked) {
  appUiConfig.showGlanceBar = checked;
  syncSaveUiConfig({ showGlanceBar: checked });
  renderGlanceBar();
  showToast(checked ? 'Barra de Badges (Glance) ativada no topo.' : 'Barra de Badges oculta. Exibindo apenas atalhos rápidos.');
}

function toggleGlanceBadge(badgeId, checked) {
  const badge = (appUiConfig.glanceBadges || []).find(b => b.id === badgeId);
  if (badge) {
    badge.enabled = checked;
    syncSaveUiConfig({ glanceBadges: appUiConfig.glanceBadges });
    renderGlanceBar();
    renderGlanceManageList();
  }
}

function moveGlanceBadge(badgeId, direction) {
  const badges = appUiConfig.glanceBadges || [];
  const idx = badges.findIndex(b => b.id === badgeId);
  if (idx < 0) return;
  const targetIdx = idx + direction;
  if (targetIdx < 0 || targetIdx >= badges.length) return;

  const temp = badges[idx];
  badges[idx] = badges[targetIdx];
  badges[targetIdx] = temp;

  appUiConfig.glanceBadges = badges;
  syncSaveUiConfig({ glanceBadges: badges });
  renderGlanceManageList();
  renderGlanceBar();
}

function openCustomizeShortcutsModal(source = 'overview') {
  const modal = document.getElementById('customizeShortcutsModal');
  if (!modal) return;

  switchCustomizeSubTab('shortcuts');
  renderManageShortcutsList();
  renderGlanceManageList();
  populateNewShortcutTargets();

  modal.classList.add('active');
}

function closeCustomizeShortcutsModal() {
  const modal = document.getElementById('customizeShortcutsModal');
  if (modal) modal.classList.remove('active');
  renderCustomShortcuts();
  renderGlanceBar();
}

// =============================================================
// SIMULADOR MOBILE / APP COMPANION ANDROID (ARTEMIS VIEWPORT)
// =============================================================
function openMobileSimulatorModal() {
  const modal = document.getElementById('mobileSimulatorModal');
  if (!modal) return;
  modal.classList.add('active');

  const clockEl = document.getElementById('simPhoneClock');
  if (clockEl) {
    const now = new Date();
    clockEl.innerText = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  }

  const iframe = document.getElementById('simIframe');
  if (iframe && !iframe.getAttribute('src')) {
    iframe.src = './index.html?mode=mobile_sim';
  }
}

function closeMobileSimulatorModal() {
  const modal = document.getElementById('mobileSimulatorModal');
  if (modal) modal.classList.remove('active');
}

function setSimDevice(device) {
  const chassis = document.getElementById('phoneChassis');
  const btnPixel = document.getElementById('btnDevPixel');
  const btnIphone = document.getElementById('btnDevIphone');
  const btnTablet = document.getElementById('btnDevTablet');

  if (btnPixel) btnPixel.classList.toggle('active', device === 'pixel');
  if (btnIphone) btnIphone.classList.toggle('active', device === 'iphone');
  if (btnTablet) btnTablet.classList.toggle('active', device === 'tablet');

  if (!chassis) return;
  chassis.classList.remove('chassis-pixel', 'chassis-iphone', 'chassis-tablet');

  if (device === 'pixel') chassis.classList.add('chassis-pixel');
  else if (device === 'iphone') chassis.classList.add('chassis-iphone');
  else if (device === 'tablet') chassis.classList.add('chassis-tablet');
}

function toggleSimOrientation() {
  const chassis = document.getElementById('phoneChassis');
  if (chassis) chassis.classList.toggle('is-landscape');
}

function openSimInNewTab() {
  window.open('./index.html?mode=standalone', '_blank', 'width=412,height=915,menubar=no,toolbar=no,location=no');
}

function renderManageShortcutsList() {
  const listEl = document.getElementById('activeShortcutsList');
  const countEl = document.getElementById('countActiveShortcuts');
  const shortcuts = getCustomShortcuts();

  if (countEl) countEl.innerText = shortcuts.length;
  if (!listEl) return;

  if (shortcuts.length === 0) {
    listEl.innerHTML = '<div style="color:var(--text-dim); text-align:center; padding:20px;">Nenhum atalho configurado. Adicione um novo abaixo ou restaure os padrões.</div>';
    return;
  }

  listEl.innerHTML = shortcuts.map((sc, idx) => {
    const status = getShortcutStatus(sc);
    return `
      <div class="shortcut-manage-row">
        <div class="sc-info-block">
          <span style="font-size:20px;">${sc.icon || '⚡'}</span>
          <div class="sc-info-titles">
            <span class="sc-info-name">${sc.name}</span>
            <span class="sc-info-sub">Status: <strong style="color:${status.color}">${status.text}</strong> • Ação: ${sc.action || 'toggle'}</span>
          </div>
        </div>
        <div class="sc-controls-block">
          ${idx > 0 ? `<button class="btn-icon-action" onclick="moveShortcut('${sc.id}', -1)" title="Mover para Cima">⬆️</button>` : ''}
          ${idx < shortcuts.length - 1 ? `<button class="btn-icon-action" onclick="moveShortcut('${sc.id}', 1)" title="Mover para Baixo">⬇️</button>` : ''}
          <button class="btn-icon-action btn-del" onclick="deleteShortcut('${sc.id}')" title="Excluir este atalho">🗑️</button>
        </div>
      </div>
    `;
  }).join('');
}

function populateNewShortcutTargets() {
  const select = document.getElementById('newScTarget');
  if (!select) return;

  let html = `
    <optgroup label="✨ Ações Gerais & Cenários">
      <option value="gate:pulse">🚪 Acionar Portão da Garagem (Pulso)</option>
      <option value="scene:all_off">🌙 Apagar Todas as Luzes da Residência</option>
      <option value="scene:main_on">💡 Acender Luzes Principais</option>
      <option value="byd:toggle">⚡ Alternar Disjuntor Wallbox BYD</option>
      <option value="ac:toggle">❄️ Alternar Ar Condicionado Mizin</option>
      <option value="nav:cameras">📹 Abrir Central de Câmeras</option>
      <option value="nav:energy">⚡ Abrir Telemetria de Energia</option>
      <option value="nav:logs">📋 Abrir Registro de Atividades</option>
    </optgroup>
    <optgroup label="💡 Dispositivos Conectados (Tuya / SmartLife)">
  `;

  devices.forEach(dev => {
    const name = dev.name || dev.id;
    html += `<option value="dev:${dev.id}:1">⚡ ${name} (Canal 1 / Geral)</option>`;
    if (dev.category === 'kg' || dev.category === 'dj' || (dev.live_dps && dev.live_dps['2'] !== undefined)) {
      html += `<option value="dev:${dev.id}:2">⚡ ${name} (Canal 2)</option>`;
    }
  });

  html += `</optgroup>`;
  select.innerHTML = html;

  handleNewScTargetChange(select.value);
}

function handleNewScTargetChange(val) {
  const nameInput = document.getElementById('newScName');
  const iconInput = document.getElementById('newScIcon');
  const actionSelect = document.getElementById('newScAction');

  if (!val) return;

  if (val === 'gate:pulse') {
    if (nameInput) nameInput.value = 'Acionar Portão';
    if (iconInput) iconInput.value = '🚪';
    if (actionSelect) actionSelect.value = 'pulse';
  } else if (val === 'scene:all_off') {
    if (nameInput) nameInput.value = 'Apagar Todas as Luzes';
    if (iconInput) iconInput.value = '🌙';
    if (actionSelect) actionSelect.value = 'turn_off';
  } else if (val === 'scene:main_on') {
    if (nameInput) nameInput.value = 'Acender Principais';
    if (iconInput) iconInput.value = '💡';
    if (actionSelect) actionSelect.value = 'turn_on';
  } else if (val === 'byd:toggle') {
    if (nameInput) nameInput.value = 'Disjuntor BYD';
    if (iconInput) iconInput.value = '⚡';
    if (actionSelect) actionSelect.value = 'toggle';
  } else if (val === 'ac:toggle') {
    if (nameInput) nameInput.value = 'Ar Condicionado';
    if (iconInput) iconInput.value = '❄️';
    if (actionSelect) actionSelect.value = 'toggle';
  } else if (val.startsWith('dev:')) {
    const parts = val.split(':');
    const devId = parts[1];
    const ch = parts[2];
    const dev = devices.find(d => d.id === devId || d.local_ip === devId);
    if (dev) {
      if (nameInput) nameInput.value = ch === '2' ? `${dev.name} (Ch 2)` : dev.name;
      if (iconInput) iconInput.value = dev.category === 'kg' ? '💡' : '⚡';
      if (actionSelect) actionSelect.value = 'toggle';
    }
  }
}

function addNewShortcut() {
  const targetVal = document.getElementById('newScTarget')?.value || '';
  const name = document.getElementById('newScName')?.value.trim();
  const icon = document.getElementById('newScIcon')?.value.trim() || '⚡';
  const action = document.getElementById('newScAction')?.value || 'toggle';
  const showOverview = document.getElementById('newScShowOverview')?.checked ?? true;
  const showCameras = document.getElementById('newScShowCameras')?.checked ?? true;
  const showPopup = document.getElementById('newScShowPopup')?.checked ?? true;

  if (!name) {
    alert('Por favor, informe o nome do atalho.');
    return;
  }

  const shortcuts = getCustomShortcuts();
  const newId = 'sc_' + Date.now();

  let scObj = {
    id: newId,
    name,
    icon,
    action,
    showOverview,
    showCameras,
    showPopup
  };

  if (targetVal === 'gate:pulse') {
    scObj.type = 'gate';
  } else if (targetVal === 'scene:all_off') {
    scObj.type = 'scene_all_off';
  } else if (targetVal === 'scene:main_on') {
    scObj.type = 'scene_main_on';
  } else if (targetVal === 'byd:toggle') {
    scObj.type = 'byd';
  } else if (targetVal === 'ac:toggle') {
    scObj.type = 'ac';
  } else if (targetVal.startsWith('nav:')) {
    scObj.type = 'nav';
    scObj.targetId = targetVal.split(':')[1];
  } else if (targetVal.startsWith('dev:')) {
    const parts = targetVal.split(':');
    scObj.type = 'device';
    scObj.targetId = parts[1];
    scObj.channel = parseInt(parts[2] || 1);
  }

  shortcuts.push(scObj);
  saveCustomShortcuts(shortcuts);
  renderManageShortcutsList();
  renderCustomShortcuts();
  showToast(`Atalho "${name}" adicionado com sucesso! ✅`);
}

function deleteShortcut(scId) {
  let shortcuts = getCustomShortcuts();
  const item = shortcuts.find(s => s.id === scId);
  if (!item) return;

  shortcuts = shortcuts.filter(s => s.id !== scId);
  saveCustomShortcuts(shortcuts);
  renderManageShortcutsList();
  renderCustomShortcuts();
  showToast(`Atalho "${item.name}" excluído.`);
}

function moveShortcut(scId, direction) {
  const shortcuts = getCustomShortcuts();
  const idx = shortcuts.findIndex(s => s.id === scId);
  if (idx < 0) return;

  const targetIdx = idx + direction;
  if (targetIdx < 0 || targetIdx >= shortcuts.length) return;

  const temp = shortcuts[idx];
  shortcuts[idx] = shortcuts[targetIdx];
  shortcuts[targetIdx] = temp;

  saveCustomShortcuts(shortcuts);
  renderManageShortcutsList();
  renderCustomShortcuts();
}

function resetShortcutsToDefaults() {
  if (confirm('Deseja restaurar todos os atalhos sugeridos de fábrica? Seus atalhos personalizados serão substituídos pelos modelos recomendados.')) {
    saveCustomShortcuts(DEFAULT_SHORTCUTS);
    renderManageShortcutsList();
    renderCustomShortcuts();
    showToast('Atalhos restaurados para o padrão de fábrica! 🔄');
  }
}

// -------------------------------------------------------------
// Visualizador e Monitoramento de Câmeras — Surveillance Theater
// -------------------------------------------------------------
activePtzCam = null;
isAudioListening = false;
isPttTalking = false;
let activeCameraQuality = 'auto'; // 'auto', 'native', '2k', '1080p', '720p'
let activeCameraViewMode = 'dual'; // 'dual', 'view1', 'view2'
let activePtzTargetChannel = 'both'; // 'both', 0, 1
let isCameraLightOn = false;
let isCameraSirenOn = false;
let currentSdRecordings = [];
let selectedTimelineDate = new Date().toISOString().slice(0, 10);
let pttMediaRecorder = null;
let pttAudioStream = null;

// The cameras send HEVC. When this browser decodes it, the NAS forwards the original stream instead of transcoding.
const BROWSER_PLAYS_HEVC = (() => {
  try {
    const type = 'video/mp4; codecs="hvc1.1.6.L153.B0"';
    return /probably|maybe/.test(document.createElement('video').canPlayType(type)) || !!window.MediaSource?.isTypeSupported?.(type);
  } catch { return false; }
})();
let hevcPlaybackFailed = false;

function resolveEffectiveCameraQuality() {
  if ((activeCameraQuality === 'auto' || activeCameraQuality === 'native') && BROWSER_PLAYS_HEVC && !hevcPlaybackFailed) return 'original';
  if (activeCameraQuality !== 'auto') return activeCameraQuality;
  // Modo Automático Inteligente:
  // Na rede local (0ms de latência LAN) -> 1080p ou 2k
  if (isLocalAccess) return '1080p';
  // No acesso remoto via Cloudflare / externa -> 720p para máxima velocidade e zero buffering
  return '720p';
}

function openPtzModal(camId) {
  activePtzCam = camId;
  const modal = document.getElementById('cameraPtzModal');
  const nameEl = document.getElementById('ptzModalCamName');
  const aliasEl = document.getElementById('ptzModalCamAlias');
  const modelBadgeEl = document.getElementById('ptzModalModelBadge');
  const iconEl = document.getElementById('ptzModalIcon');
  const ptzMotorSection = document.getElementById('ptzMotorSection');
  const aw300Section = document.getElementById('aw300Section');
  const mi2kSection = document.getElementById('mi2kSection');
  const viewModeSelector = document.getElementById('ptzViewModeSelector');
  const ptzAiBadgesGrid = document.getElementById('ptzAiBadgesGrid');
  const floatingGateBtn = document.getElementById('ptzFloatingGateBtn');

  const camObj = (window._cachedCameras || []).find(c => c.id === camId) || { id: camId, name: 'Câmera ' + camId, sourceAlias: camId };

  // Identificação dos 3 Modelos Distintos de Hardware
  const isOutdoorPro = (camId === 'outdoor_pro_poste' || (camObj.family && camObj.family.toLowerCase().includes('outdoor pro')) || (camObj.name && camObj.name.toLowerCase().includes('outdoor pro')));
  const isAw300 = (!isOutdoorPro && (camId.includes('aw300') || (camObj.family && camObj.family.toLowerCase().includes('aw300')) || (camObj.name && camObj.name.toLowerCase().includes('aw300'))));
  const isMi2k = (!isOutdoorPro && !isAw300);

  const isGateCam = camId.includes('portao') || camId.includes('garagem') || (camObj.name && (camObj.name.toLowerCase().includes('portão') || camObj.name.toLowerCase().includes('garagem')));
  if (floatingGateBtn) {
    floatingGateBtn.style.display = isGateCam ? 'inline-flex' : 'none';
  }

  // Ajuste do Grid para Câmeras Fixas vs Motorizada (Outdoor Pro PTZ)
  const contentGrid = document.querySelector('.ptz-modal-content-grid');
  const ptzControlsCol = document.querySelector('.ptz-controls-column');
  if (contentGrid) {
    if (isOutdoorPro) {
      contentGrid.classList.remove('is-fixed-cam');
      if (ptzControlsCol) ptzControlsCol.style.display = '';
    } else {
      contentGrid.classList.add('is-fixed-cam');
      if (ptzControlsCol) ptzControlsCol.style.display = 'none';
    }
  }

  // Configuração por Modelo
  if (isOutdoorPro) {
    if (nameEl) nameEl.innerText = `${camObj.name}`;
    if (modelBadgeEl) {
      modelBadgeEl.innerText = 'CW701 • 3K DUAL SENSOR PTZ';
      modelBadgeEl.className = 'badge badge-live';
    }
    if (iconEl) iconEl.innerText = '🎮';
    if (viewModeSelector) viewModeSelector.style.display = 'flex';
    if (ptzMotorSection) ptzMotorSection.style.display = 'block';
    if (aw300Section) aw300Section.style.display = 'none';
    if (mi2kSection) mi2kSection.style.display = 'none';

    // Recursos de IA Outdoor Pro
    if (ptzAiBadgesGrid) {
      ptzAiBadgesGrid.innerHTML = `
        <span class="ai-badge-chip">🚶 Detecção Humana 3K</span>
        <span class="ai-badge-chip">🚗 Detecção Veicular</span>
        <span class="ai-badge-chip">🛡️ Cerca Virtual Perimetral</span>
        <span class="ai-badge-chip">🔥 Detecção Chamas / Fumaça</span>
        <span class="ai-badge-chip">🎯 Rastreamento Dinâmico de Alvo</span>
      `;
    }
  } else if (isAw300) {
    if (nameEl) nameEl.innerText = `${camObj.name}`;
    if (modelBadgeEl) {
      modelBadgeEl.innerText = 'AW300 • 2K ULTRA CLEAR';
      modelBadgeEl.className = 'badge badge-cyan';
    }
    if (iconEl) iconEl.innerText = '🛡️';
    if (viewModeSelector) viewModeSelector.style.display = 'none';
    if (ptzMotorSection) ptzMotorSection.style.display = 'none';
    if (aw300Section) aw300Section.style.display = 'block';
    if (mi2kSection) mi2kSection.style.display = 'none';

    // Recursos de IA AW300
    if (ptzAiBadgesGrid) {
      ptzAiBadgesGrid.innerHTML = `
        <span class="ai-badge-chip">🚶 Detecção Humana Noturna</span>
        <span class="ai-badge-chip">🛡️ Zona de Foco Eletrônica</span>
        <span class="ai-badge-chip">🚨 Alerta Luminoso Dissuasivo</span>
        <span class="ai-badge-chip">💾 Gravação Contínua SD</span>
      `;
    }
  } else {
    // Mi 2K Standard (hlc7)
    if (nameEl) nameEl.innerText = `${camObj.name}`;
    if (modelBadgeEl) {
      modelBadgeEl.innerText = 'MI 2K • BASE MAGNÉTICA';
      modelBadgeEl.className = 'badge badge-emerald';
    }
    if (iconEl) iconEl.innerText = '📹';
    if (viewModeSelector) viewModeSelector.style.display = 'none';
    if (ptzMotorSection) ptzMotorSection.style.display = 'none';
    if (aw300Section) aw300Section.style.display = 'none';
    if (mi2kSection) mi2kSection.style.display = 'block';

    // Recursos de IA Mi 2K Standard
    if (ptzAiBadgesGrid) {
      ptzAiBadgesGrid.innerHTML = `
        <span class="ai-badge-chip">🚶 Detecção de Movimento IA</span>
        <span class="ai-badge-chip">👶 Detecção de Choro e Ruídos</span>
        <span class="ai-badge-chip">🌙 IR 940nm Invisível</span>
      `;
    }
  }

  if (aliasEl) aliasEl.innerText = `Stream seguro: ${camObj.sourceAlias || camId} • Resolução Nativa • P2P Xiaomi`;

  // Inicializa modo de visualização e carregamento de vídeo
  if (isOutdoorPro) {
    switchCameraViewMode(activeCameraViewMode || 'dual');
  } else {
    setupSingleCameraView(camObj);
  }

  // Preenche a data de hoje no seletor de gravações SD e carrega timeline
  const dateInput = document.getElementById('timelineDateInput');
  if (dateInput) {
    selectedTimelineDate = new Date().toISOString().slice(0, 10);
    dateInput.value = selectedTimelineDate;
  }
  fetchSdRecordings(camId, selectedTimelineDate);

  renderCustomShortcuts();
  switchTheaterTab('live');
  if (modal) modal.classList.add('active');
}

function getCameraWsUrl(streamAlias) {
  if (BACKEND_API_BASE) {
    const wsBase = BACKEND_API_BASE.replace(/^http/, 'ws');
    return `${wsBase}/api/ws?src=${encodeURIComponent(streamAlias)}`;
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/api/ws?src=${encodeURIComponent(streamAlias)}`;
}

function stopStreamElement(streamEl) {
  if (!streamEl) return;
  try {
    streamEl.src = '';
    if (typeof streamEl.ondisconnect === 'function') {
      streamEl.ondisconnect();
    }
    streamEl.style.display = 'none';
  } catch (e) {}
}

function stopHttpVideoElement(videoEl) {
  if (!videoEl) return;
  if (videoEl._wsCleanup) {
    videoEl._wsCleanup();
    videoEl._wsCleanup = null;
  }
  try {
    videoEl.onplaying = null;
    videoEl.onloadeddata = null;
    videoEl.oncanplay = null;
    videoEl.onerror = null;
    videoEl.pause();
    videoEl.removeAttribute('src');
    videoEl.load();
    videoEl.style.display = 'none';
  } catch (e) {}
}

function setSecondLensNotice(text) {
  const wrap = document.getElementById('ptzPlayerWrap2');
  if (!wrap) return;
  let note = document.getElementById('ptzSecondLensNotice');
  if (!note) { note = document.createElement('div'); note.id = 'ptzSecondLensNotice'; note.className = 'ptz-lens-notice'; wrap.append(note); }
  note.textContent = text;
  note.style.display = text ? 'flex' : 'none';
}
function connectCameraPlayer(streamEl, fallbackVideoEl, feedImg, spinnerEl, streamAlias, isMuted, onReadyCallback) {
  stopStreamElement(streamEl);
  if (fallbackVideoEl) {
    connectHttpStream(fallbackVideoEl, feedImg, spinnerEl, streamAlias, isMuted, onReadyCallback);
  }
}

// Live over the bridge's WebSocket (go2rtc MSE): no ffmpeg in the portal and the camera's original video.
// The bridge hands a new viewer the frames since the last keyframe, so the image shows in about a second.
// Measured on 2026-10-29 through homecams: first data in 0.2-0.8 s against 2.4-7 s over the HTTP stream.
function mseCodecs() {
  const list = ['avc1.640029', 'avc1.64002A', 'avc1.640033', 'hvc1.1.6.L153.B0', 'mp4a.40.2', 'mp4a.40.5', 'flac', 'opus'];
  return list.filter(c => window.MediaSource?.isTypeSupported?.(`video/mp4; codecs="${c}"`)).join(',');
}

function connectWsStream(videoEl, streamAlias, isMuted, onReady, onFail) {
  if (!window.MediaSource || !window.WebSocket) return false;
  const ms = new MediaSource();
  let ws = null, sb = null, queue = [], ready = false, finished = false, jumped = false;
  // Live delay: tight at home (same network as the NAS), roomier away; each stall adds a little margin.
  let targetLag = isLocalAccess ? 0.15 : 0.6;
  const cleanup = () => {
    finished = true;
    clearTimeout(timer);
    try { if (ws) { ws.onclose = null; ws.close(); } } catch (e) {}
  };
  const fail = () => {
    if (finished) return;
    cleanup();
    onFail();
  };
  const timer = setTimeout(() => { if (!ready) fail(); }, 12000);
  const pump = () => {
    if (!sb || sb.updating || finished) return;
    const ranges = sb.buffered;
    if (ranges.length) {
      const start = ranges.start(0), end = ranges.end(ranges.length - 1);
      // Start at the live edge: the replayed GOP decodes in the background. Then catch up by playing 6%
      // faster (pitch preserved) instead of jumping; jump only when far behind.
      const lag = end - videoEl.currentTime;
      if (!jumped && end > 0) { jumped = true; videoEl.currentTime = Math.max(start, end - targetLag); }
      else if (lag > targetLag + 2.5) videoEl.currentTime = end - targetLag;
      else videoEl.playbackRate = lag > targetLag + 0.1 ? 1.06 : 1;
      if (end - start > 40) { try { sb.remove(start, end - 20); return; } catch (e) {} }
    }
    if (!queue.length) return;
    const size = queue.reduce((n, b) => n + b.byteLength, 0);
    const data = new Uint8Array(size);
    let offset = 0;
    for (const b of queue) { data.set(new Uint8Array(b), offset); offset += b.byteLength; }
    queue = [];
    try { sb.appendBuffer(data); } catch (e) { fail(); }
  };
  videoEl._wsCleanup = cleanup;
  videoEl.muted = isMuted;
  videoEl.playsInline = true;
  videoEl.autoplay = true;
  videoEl.src = URL.createObjectURL(ms);
  ms.addEventListener('sourceopen', () => {
    URL.revokeObjectURL(videoEl.src);
    ws = new WebSocket(getCameraWsUrl(streamAlias));
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => ws.send(JSON.stringify({ type: 'mse', value: mseCodecs() }));
    ws.onmessage = ev => {
      if (typeof ev.data === 'string') {
        let msg = {};
        try { msg = JSON.parse(ev.data); } catch (e) {}
        if (msg.type === 'mse' && !sb) {
          try {
            sb = ms.addSourceBuffer(msg.value);
            sb.mode = 'segments';
            sb.addEventListener('updateend', pump);
          } catch (e) { fail(); }
        } else if (msg.type === 'error') fail();
        return;
      }
      queue.push(ev.data);
      pump();
    };
    ws.onerror = fail;
    ws.onclose = () => { if (!ready) fail(); };
  }, { once: true });
  const readyHandler = () => {
    if (ready || finished) return;
    ready = true;
    clearTimeout(timer);
    onReady();
  };
  videoEl.onplaying = readyHandler;
  videoEl.onloadeddata = () => { videoEl.play().catch(() => { videoEl.muted = true; videoEl.play().catch(() => {}); }); };
  videoEl.onerror = fail;
  videoEl.onwaiting = () => { if (ready) targetLag = Math.min(1.5, targetLag + 0.15); };
  return true;
}

function connectHttpStream(videoEl, feedImg, spinnerEl, streamAlias, isMuted, onReady, skipWs) {
  if (!videoEl) return;
  stopHttpVideoElement(videoEl);
  if (spinnerEl) spinnerEl.style.display = 'block';

  let readyFired = false;
  if (feedImg) {
    feedImg.style.display = 'none';
    feedImg.onload = () => { if (!readyFired) feedImg.style.display = 'block'; };
    feedImg.onerror = () => { feedImg.style.display = 'none'; };
  }

  const quality = resolveEffectiveCameraQuality();
  // Original quality goes over the WebSocket first; the HTTP stream stays as the fallback.
  if (quality === 'original' && !skipWs) {
    videoEl.style.display = 'block';
    const started = connectWsStream(videoEl, streamAlias, isMuted, () => {
      readyFired = true;
      if (feedImg) feedImg.style.display = 'none';
      if (spinnerEl) spinnerEl.style.display = 'none';
      if (onReady) onReady();
    }, () => connectHttpStream(videoEl, feedImg, spinnerEl, streamAlias, isMuted, onReady, true));
    if (started) return;
  }
  videoEl.muted = isMuted;
  videoEl.playsInline = true;
  videoEl.autoplay = true;
  videoEl.src = `${BACKEND_API_BASE}/api/camera-stream?src=${encodeURIComponent(streamAlias)}&quality=${encodeURIComponent(quality)}&t=${Date.now()}`;
  videoEl.load();
  const p = videoEl.play();
  if (p) p.catch(() => {
    videoEl.muted = true;
    videoEl.play().catch(() => {});
  });

  const readyHandler = () => {
    if (readyFired) return;
    readyFired = true;
    videoEl.style.display = 'block';
    if (feedImg) feedImg.style.display = 'none';
    if (spinnerEl) spinnerEl.style.display = 'none';
    if (onReady) onReady();
  };
  videoEl.onplaying = readyHandler;
  videoEl.onloadeddata = readyHandler;
  videoEl.oncanplay = readyHandler;
  // If the original HEVC stream cannot be decoded here, fall back once to the NAS transcode.
  const fallbackToTranscode = () => {
    if (readyFired || quality !== 'original' || hevcPlaybackFailed) return false;
    hevcPlaybackFailed = true;
    connectHttpStream(videoEl, feedImg, spinnerEl, streamAlias, isMuted, onReady);
    return true;
  };
  if (quality === 'original') setTimeout(fallbackToTranscode, 25000);
  videoEl.onerror = () => {
    if (fallbackToTranscode()) return;
    if (spinnerEl) spinnerEl.style.display = 'none';
  };
}

function setupSingleCameraView(camObj) {
  const container = document.getElementById('ptzDualVideoContainer');
  const playerWrap1 = document.getElementById('ptzPlayerWrap1');
  const playerWrap2 = document.getElementById('ptzPlayerWrap2');
  if (container) container.classList.remove('dual-active');
  if (playerWrap1) playerWrap1.style.display = 'flex';
  if (playerWrap2) playerWrap2.style.display = 'none';

  const stream2 = document.getElementById('ptzSecondaryVideoStream');
  const video2 = document.getElementById('ptzSecondaryVideoElement');
  stopStreamElement(stream2);
  stopHttpVideoElement(video2);

  const streamAlias = camObj.sourceAlias || camObj.id;
  const feedImg = document.getElementById('ptzMainVideoFeed');
  const streamEl = document.getElementById('ptzMainVideoStream');
  const videoEl = document.getElementById('ptzMainVideoElement');
  const spinnerEl = document.getElementById('ptzVideoSpinner');
  const overlayText = document.getElementById('ptzOverlayText1');

  if (overlayText) overlayText.innerText = `AO VIVO • ${activeCameraQuality === 'auto' ? ('AUTO • ' + resolveEffectiveCameraQuality().toUpperCase()) : activeCameraQuality.toUpperCase()}`;

  if (feedImg) {
    feedImg.src = `${BACKEND_API_BASE}/api/camera-frame?src=${encodeURIComponent(streamAlias)}&t=${Date.now()}`;
    feedImg.style.display = 'block';
  }

  connectCameraPlayer(streamEl, videoEl, feedImg, spinnerEl, streamAlias, !isAudioListening);
}

let dualSecondaryTimer = null;
function switchCameraViewMode(mode) {
  activeCameraViewMode = mode;
  setSecondLensNotice('');
  if (dualSecondaryTimer) {
    clearTimeout(dualSecondaryTimer);
    dualSecondaryTimer = null;
  }
  const tabDual = document.getElementById('tabDualView');
  const tabV1 = document.getElementById('tabView1');
  const tabV2 = document.getElementById('tabView2');
  const container = document.getElementById('ptzDualVideoContainer');
  const wrap1 = document.getElementById('ptzPlayerWrap1');
  const wrap2 = document.getElementById('ptzPlayerWrap2');

  if (tabDual) tabDual.className = `view-mode-tab ${mode === 'dual' ? 'active' : ''}`;
  if (tabV1) tabV1.className = `view-mode-tab ${mode === 'view1' ? 'active' : ''}`;
  if (tabV2) tabV2.className = `view-mode-tab ${mode === 'view2' ? 'active' : ''}`;

  if (currentTheaterTab === 'sd') {
    // Recordings: the switch picks the lens shown on the SD timeline and player; live streams stay closed.
    const previousLens = sdPlayLens;
    if (mode === 'view1') sdPlayLens = '0';
    if (mode === 'view2') sdPlayLens = '1';
    fetchSdRecordings(activePtzCam, selectedTimelineDate, false);
    const sdVideo = document.getElementById('sdPlaybackVideoElement');
    if (sdVideo && sdVideo.getAttribute('src')) playCurrentSdSegment(currentSdPlaySeconds);
    else if (previousLens !== sdPlayLens) markSdLaneActive();
    return;
  }

  const alias1 = 'outdoor_pro_poste_quality3';
  const alias2 = 'outdoor_pro_poste_channel2_quality3';

  const feed1 = document.getElementById('ptzMainVideoFeed');
  const stream1 = document.getElementById('ptzMainVideoStream');
  const video1 = document.getElementById('ptzMainVideoElement');
  const spinner1 = document.getElementById('ptzVideoSpinner');
  const overlay1 = document.getElementById('ptzOverlayText1');

  const feed2 = document.getElementById('ptzSecondaryVideoFeed');
  const stream2 = document.getElementById('ptzSecondaryVideoStream');
  const video2 = document.getElementById('ptzSecondaryVideoElement');

  const effective = resolveEffectiveCameraQuality();

  if (mode === 'dual') {
    if (container) container.classList.add('dual-active');
    if (wrap1) wrap1.style.display = 'flex';
    if (wrap2) wrap2.style.display = 'flex';
    if (overlay1) overlay1.innerText = `VISTA 1 • AMPLA (${activeCameraQuality === 'auto' ? ('AUTO ' + effective.toUpperCase()) : '3K'})`;

    stopStreamElement(stream2);
    stopHttpVideoElement(video2);
    if (feed2) {
      feed2.src = `${BACKEND_API_BASE}/api/camera-frame?src=${encodeURIComponent(alias2)}&t=${Date.now()}`;
      feed2.style.display = 'block';
    }

    if (feed1) {
      feed1.src = `${BACKEND_API_BASE}/api/camera-frame?src=${encodeURIComponent(alias1)}&t=${Date.now()}`;
      feed1.style.display = 'block';
    }
    let v2Started = false;
    const startSecondLens = () => {
      if (v2Started || activeCameraViewMode !== 'dual' || currentTheaterTab !== 'live') return;
      v2Started = true;
      setSecondLensNotice('');
      connectCameraPlayer(stream2, video2, feed2, null, alias2, true, () => setSecondLensNotice(''));
      setTimeout(() => { if (activeCameraViewMode === 'dual' && video2 && video2.readyState < 2) setSecondLensNotice('A Visão 2 ainda não abriu. A ponte abre as duas lentes na mesma conexão e tenta de novo sozinha; se continuar assim, feche e abra a câmera.'); }, 30000);
    };
    connectCameraPlayer(stream1, video1, feed1, spinner1, alias1, !isAudioListening, () => {
      dualSecondaryTimer = setTimeout(startSecondLens, 600);
    });
    dualSecondaryTimer = setTimeout(startSecondLens, 3500);

    showToast('Visualização Dupla Ativada: Ampla + Teleobjetiva 📺');
  } else if (mode === 'view1') {
    if (container) container.classList.remove('dual-active');
    if (wrap1) wrap1.style.display = 'flex';
    if (wrap2) wrap2.style.display = 'none';
    if (overlay1) overlay1.innerText = 'VISTA 1 • AMPLA TOTAL';
    stopStreamElement(stream2);
    stopHttpVideoElement(video2);
    if (feed1) {
      feed1.src = `${BACKEND_API_BASE}/api/camera-frame?src=${encodeURIComponent(alias1)}&t=${Date.now()}`;
      feed1.style.display = 'block';
    }
    connectCameraPlayer(stream1, video1, feed1, spinner1, alias1, !isAudioListening);
    showToast('Exibindo Vista 1: Grande Angular 👁️');
  } else if (mode === 'view2') {
    if (container) container.classList.remove('dual-active');
    if (wrap1) wrap1.style.display = 'none';
    if (wrap2) wrap2.style.display = 'flex';
    stopStreamElement(stream1);
    stopHttpVideoElement(video1);
    if (feed2) {
      feed2.src = `${BACKEND_API_BASE}/api/camera-frame?src=${encodeURIComponent(alias2)}&t=${Date.now()}`;
      feed2.style.display = 'block';
    }
    connectCameraPlayer(stream2, video2, feed2, null, alias2, !isAudioListening);
    showToast('Exibindo Vista 2: Teleobjetiva / Motorizada 🎯');
  }
}

function setCameraQuality(quality) {
  activeCameraQuality = quality;
  const pills = document.querySelectorAll('.quality-pill');
  pills.forEach(p => {
    if (p.getAttribute('data-quality') === quality) p.classList.add('active');
    else p.classList.remove('active');
  });

  const effective = resolveEffectiveCameraQuality();
  const autoPill = document.getElementById('qualityAuto');
  if (autoPill) {
    autoPill.innerText = quality === 'auto' ? `🔄 Auto (${effective.toUpperCase()})` : '🔄 Automática';
  }

  const camObj = (window._cachedCameras || []).find(c => c.id === activePtzCam) || { id: activePtzCam };
  const isOutdoorPro = (activePtzCam === 'outdoor_pro_poste' || (camObj.family && camObj.family.toLowerCase().includes('outdoor pro')));
  if (isOutdoorPro) {
    switchCameraViewMode(activeCameraViewMode || 'dual');
  } else {
    setupSingleCameraView(camObj);
  }
  const labels = {
    auto: `Automática Adaptativa (${effective.toUpperCase()})`,
    native: '3K/4K Nativa',
    '2k': '2K Quad HD',
    '1080p': '1080p Full HD',
    '720p': '720p Econômica'
  };
  showToast(`Qualidade de transmissão ajustada para: ${labels[quality] || quality} 💎`);
}

function setPtzTargetChannel(target) {
  activePtzTargetChannel = target;
  const pillBoth = document.getElementById('ptzTargetBoth');
  const pillV1 = document.getElementById('ptzTargetV1');
  const pillV2 = document.getElementById('ptzTargetV2');
  if (pillBoth) pillBoth.className = `ptz-target-pill ${target === 'both' ? 'active' : ''}`;
  if (pillV1) pillV1.className = `ptz-target-pill ${target === 0 ? 'active' : ''}`;
  if (pillV2) pillV2.className = `ptz-target-pill ${target === 1 ? 'active' : ''}`;

  const desc = target === 'both' ? 'Ambas as Vistas' : target === 0 ? 'Vista 1 (Ampla)' : 'Vista 2 (Tele/PTZ)';
  showToast(`Comandos de movimento direcionados para: ${desc} 🎯`);
}

async function sendPtzCommand(cmd) {
  const camName = activePtzCam || 'Outdoor Pro';
  const directions = {
    up: 'Mover para Cima ⬆️',
    down: 'Mover para Baixo ⬇️',
    left: 'Mover para Esquerda ⬅️',
    right: 'Mover para Direita ➡️',
    home: 'Posição Central 🎯',
    zoom_in: 'Zoom In (+)',
    zoom_out: 'Zoom Out (-)'
  };

  try {
    await fetch('/api/camera/ptz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cameraId: activePtzCam,
        command: cmd,
        channel: activePtzTargetChannel === 'both' ? 0 : activePtzTargetChannel
      })
    });
  } catch (e) {}

  showToast(`[PTZ ${camName}]: ${directions[cmd] || cmd}`);
}

async function toggleCameraLight() {
  isCameraLightOn = !isCameraLightOn;
  const btn = document.getElementById('btnToggleCameraLight');
  if (btn) {
    btn.innerText = isCameraLightOn ? 'Apagar Holofote' : 'Acender Holofote';
    btn.className = `btn btn-sm ${isCameraLightOn ? 'btn-primary' : 'btn-secondary'}`;
  }

  const slider = document.getElementById('cameraLightBrightness');
  const brightness = slider ? parseInt(slider.value) : 100;

  try {
    await fetch('/api/camera/light', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cameraId: activePtzCam, on: isCameraLightOn, brightness })
    });
  } catch (e) {}

  showToast(`Holofote da câmera ${isCameraLightOn ? 'ACESO 💡' : 'APAGADO 🌑'}`);
}

async function adjustCameraLightBrightness(val) {
  const valEl = document.getElementById('cameraLightBrightnessVal');
  if (valEl) valEl.innerText = `${val}%`;
  if (isCameraLightOn) {
    try {
      await fetch('/api/camera/light', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cameraId: activePtzCam, on: true, brightness: parseInt(val) })
      });
    } catch (e) {}
  }
}

async function toggleCameraSiren() {
  isCameraSirenOn = !isCameraSirenOn;
  const btn = document.getElementById('btnToggleCameraSiren');
  if (btn) {
    btn.innerText = isCameraSirenOn ? 'SILENCIAR ALARME' : 'Soar Sirene Alerta';
    btn.className = `btn btn-sm ${isCameraSirenOn ? 'btn-danger' : 'btn-outline-rose'}`;
  }

  try {
    await fetch('/api/camera/siren', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cameraId: activePtzCam, active: isCameraSirenOn, durationSec: 15 })
    });
  } catch (e) {}

  showToast(isCameraSirenOn ? '🚨 SIRENE ANTI-INTRUSÃO DISPARADA NA CÂMERA!' : 'Sirene desativada.');
}

function captureLiveSnapshot() {
  const videoEl = (activeCameraViewMode === 'view2') ? document.getElementById('ptzSecondaryVideoElement') : document.getElementById('ptzMainVideoElement');
  const feedImg = (activeCameraViewMode === 'view2') ? document.getElementById('ptzSecondaryVideoFeed') : document.getElementById('ptzMainVideoFeed');

  try {
    const canvas = document.createElement('canvas');
    if (videoEl && videoEl.videoWidth > 0) {
      canvas.width = videoEl.videoWidth;
      canvas.height = videoEl.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      triggerFileDownload(dataUrl, `foto-${activePtzCam}-${Date.now()}.jpg`);
      showToast('📸 Foto em alta resolução capturada com sucesso!');
      return;
    } else if (feedImg && feedImg.naturalWidth > 0) {
      canvas.width = feedImg.naturalWidth;
      canvas.height = feedImg.naturalHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(feedImg, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      triggerFileDownload(dataUrl, `foto-${activePtzCam}-${Date.now()}.jpg`);
      showToast('📸 Foto capturada do stream estático!');
      return;
    }
  } catch (e) {}

  // Fallback direto via URL
  const src = (activeCameraViewMode === 'view2') ? 'outdoor_pro_poste_channel2_quality3' : (activePtzCam || 'camera');
  window.open(`${BACKEND_API_BASE}/api/camera-frame?src=${encodeURIComponent(src)}&download=1`, '_blank');
  showToast('📸 Foto baixada!');
}

function triggerFileDownload(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function createSceneFromCamera() {
  const camObj = (window._cachedCameras || []).find(c => c.id === activePtzCam) || { id: activePtzCam, name: activePtzCam };
  closePtzModal();
  switchTab('scenes');
  openCreateSceneModal();
  const nameInput = document.getElementById('sceneModalTitle');
  if (nameInput) nameInput.value = `Alerta Monitoramento: ${camObj.name}`;
  showToast(`Criando nova automação com a câmera ${camObj.name}... ⚡`);
}

function goToPresetZone(zoneName) {
  showToast(`Posicionando câmera na zona: 📍 ${zoneName}`);
}

function saveCurrentPresetZone() {
  const zoneName = prompt('Digite o nome desta nova zona pré-definida:', 'Área de Foco');
  if (zoneName) {
    showToast(`Zona "${zoneName}" gravada com sucesso na memória da câmera! ✅`);
  }
}

function toggleAudioListen() {
  isAudioListening = !isAudioListening;
  const icon = document.getElementById('audioListenIcon');
  const text = document.getElementById('audioListenText');
  const btn = document.getElementById('btnAudioListen');
  const statusText = document.getElementById('audioStatusText');
  const waveMeter = document.getElementById('audioWaveMeter');

  const stream1 = document.getElementById('ptzMainVideoStream');
  const stream2 = document.getElementById('ptzSecondaryVideoStream');
  const innerVid1 = stream1 ? (stream1.querySelector('video') || stream1.video) : null;
  const innerVid2 = stream2 ? (stream2.querySelector('video') || stream2.video) : null;
  const video1 = document.getElementById('ptzMainVideoElement');
  const video2 = document.getElementById('ptzSecondaryVideoElement');

  if (isAudioListening) {
    if (icon) icon.innerText = '🔊';
    if (text) text.innerText = 'Retorno Ativo (Ouvindo)';
    if (btn) btn.style.background = 'rgba(56, 189, 248, 0.25)';
    if (statusText) statusText.innerText = '🔊 Retorno de Som Ativo — Ouvindo ambiente da câmera ao vivo';
    if (waveMeter) waveMeter.style.display = 'flex';

    if (innerVid1) {
      innerVid1.muted = false;
      innerVid1.volume = 1.0;
      innerVid1.play().catch(e => console.log('Audio listen innerVid1 error:', e));
    }
    if (video1) {
      video1.muted = false;
      video1.volume = 1.0;
      video1.play().catch(e => console.log('Audio listen video1 error:', e));
    }
    if (activeCameraViewMode === 'view2') {
      if (innerVid2) {
        innerVid2.muted = false;
        innerVid2.volume = 1.0;
        innerVid2.play().catch(e => console.log('Audio listen innerVid2 error:', e));
      }
      if (video2) {
        video2.muted = false;
        video2.volume = 1.0;
        video2.play().catch(e => console.log('Audio listen video2 error:', e));
      }
    }
    showToast('Retorno de som da câmera ativado! 🔊');
  } else {
    if (icon) icon.innerText = '🔇';
    if (text) text.innerText = 'Ouvir Retorno';
    if (btn) btn.style.background = '';
    if (statusText) statusText.innerText = 'Áudio Bidirecional: Microfone e Alto-Falante Prontos';
    if (waveMeter) waveMeter.style.display = 'none';

    if (innerVid1) innerVid1.muted = true;
    if (video1) video1.muted = true;
    if (innerVid2) innerVid2.muted = true;
    if (video2) video2.muted = true;
    showToast('Retorno de som da câmera mutado.');
  }
}

let isAudioTalking = false;
let audioTalkStream = null;
let audioTalkRecorder = null;
let audioTalkCtx = null;
let audioTalkScriptNode = null;
let audioTalkCycleTimeout = null;
let audioTalkTarget = null;
let talkUploadChain = Promise.resolve();
let audioTalkGeneration = 0;
let audioTalkSocket = null;
let talkMutedListen = false;

// Continuous talk channel (camera-talk-stream.mjs): one WebSocket per talk carrying 16 kHz PCM every 64 ms.
// The portal encodes the whole talk at once and the bridge paces 40 ms frames to the camera, after the
// camera confirms the speaker channel (as the official app does). Resolves true, 'busy' or false (fallback).
function talkSocketUrl(camId) {
  const base = BACKEND_API_BASE ? BACKEND_API_BASE.replace(/^http/, 'ws') : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`;
  // At home the bridge keeps a smaller jitter margin (fast=1).
  return `${base}/api/camera/talk-ws?id=${encodeURIComponent(camId)}${isLocalAccess ? '&fast=1' : ''}`;
}

function startTalkSocket(camId, generation) {
  return new Promise(resolve => {
    let ws, ready = false;
    try { ws = new WebSocket(talkSocketUrl(camId)); } catch (e) { resolve(false); return; }
    ws.binaryType = 'arraybuffer';
    const timer = setTimeout(() => { if (!ready) { try { ws.close(); } catch (e) {} resolve(false); } }, 10000);
    ws.onmessage = ev => {
      if (typeof ev.data !== 'string') return;
      let msg = {};
      try { msg = JSON.parse(ev.data); } catch (e) {}
      if (msg.type === 'ready' && !ready) {
        ready = true;
        clearTimeout(timer);
        if (generation !== audioTalkGeneration || !isAudioTalking) { ws.close(); resolve(false); return; }
        audioTalkSocket = ws;
        beginTalkCapture(ws);
        resolve(true);
      } else if (msg.type === 'error') {
        clearTimeout(timer);
        if (!ready) { resolve(/ocupad|occupied|busy/i.test(msg.error || '') ? 'busy' : false); return; }
        showToast(msg.error || 'A câmera encerrou o canal de fala.', '', '⚠️', 'warning');
      }
    };
    ws.onerror = () => { clearTimeout(timer); if (!ready) resolve(false); };
    ws.onclose = () => {
      clearTimeout(timer);
      if (!ready) { resolve(false); return; }
      if (audioTalkSocket === ws) {
        audioTalkSocket = null;
        if (isAudioTalking && generation === audioTalkGeneration) toggleAudioTalk();
      }
    };
  });
}

function beginTalkCapture(ws) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const actx = new AudioCtx({ sampleRate: 16000 });
  audioTalkCtx = actx;
  const micSource = actx.createMediaStreamSource(audioTalkStream);
  // 1024 samples = 64 ms at 16 kHz (512 = 32 ms at home): small blocks keep the voice close to real time.
  const node = actx.createScriptProcessor(isLocalAccess ? 512 : 1024, 1, 1);
  audioTalkScriptNode = node;
  const ratio = actx.sampleRate / 16000;
  const silentGain = actx.createGain();
  silentGain.gain.value = 0;
  node.onaudioprocess = ev => {
    if (!isAudioTalking || ws.readyState !== 1 || ws.bufferedAmount > 128 * 1024) return;
    const input = ev.inputBuffer.getChannelData(0);
    // Some browsers ignore the requested rate: average down to 16 kHz.
    const length = Math.floor(input.length / ratio);
    const pcm16 = new Int16Array(length);
    for (let i = 0; i < length; i++) {
      let sum = 0, count = 0;
      for (let j = Math.floor(i * ratio); j < Math.floor((i + 1) * ratio) && j < input.length; j++) { sum += input[j]; count++; }
      let v = count ? sum / count : 0;
      if (v > 1) v = 1; else if (v < -1) v = -1;
      pcm16[i] = v < 0 ? v * 0x8000 : v * 0x7FFF;
    }
    ws.send(pcm16.buffer);
  };
  micSource.connect(node);
  node.connect(silentGain);
  silentGain.connect(actx.destination);
}

async function toggleAudioTalk() {
  const btn = document.getElementById('btnAudioTalk');
  const icon = document.getElementById('audioTalkIcon');
  const text = document.getElementById('audioTalkText');
  const statusText = document.getElementById('audioStatusText');
  const waveMeter = document.getElementById('audioWaveMeter');
  const camId = audioTalkTarget || activePtzCam;
  if(!camId)return;

  if (!isAudioTalking) {
    const generation=++audioTalkGeneration;
    // ATIVAR MICROFONE INSTANTANEAMENTE (1 TOQUE)
    isAudioTalking = true;
    isPttTalking = true;
    audioTalkTarget=camId;

    if (btn) {
      btn.classList.add('active-talking');
      btn.style.background = 'linear-gradient(135deg, rgba(239, 68, 68, 0.45) 0%, rgba(220, 38, 38, 0.75) 100%)';
      btn.style.borderColor = 'rgba(239, 68, 68, 0.95)';
    }
    if (icon) icon.innerText = '🔴';
    if (text) text.innerText = 'Conectando microfone…';
    if (statusText) statusText.innerText = 'Aguardando conexão com a câmera…';
    if (waveMeter) waveMeter.style.display = 'flex';

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const microphone = await navigator.mediaDevices.getUserMedia({
          audio: {
            channelCount: 1,
            echoCancellation: true, // Remove retorno e microfonia
            noiseSuppression: true, // Filtra ruído ambiente, ventilador e chiado da sala
            autoGainControl: true
          }
        });

        if (!isAudioTalking || generation!==audioTalkGeneration) {
          microphone.getTracks().forEach(t => t.stop());
          return;
        }
        audioTalkStream=microphone;

        // Like the official app, the camera's sound is muted while talking (no echo of your own voice).
        talkMutedListen = isAudioListening;
        if (talkMutedListen) toggleAudioListen();
        const viaSocket = await startTalkSocket(camId, generation);
        if (generation !== audioTalkGeneration) return;
        if (viaSocket === 'busy') throw new Error('O canal de fala da câmera está ocupado (outro aparelho falando com ela).');
        if (viaSocket === true) {
          if (text) text.innerText = 'Falar ativo';
          if (statusText) statusText.innerText = 'Canal de fala aberto e confirmado pela câmera.';
          showToast('Canal de fala conectado. Pode falar.', '', '🎙️', 'success');
          return;
        }

        // Abre canal de alto-falante na câmera (0x106 MISS_CMD_SPEAKER_START_REQ)
        talkUploadChain=talkUploadChain.catch(()=>{}).then(()=>generation===audioTalkGeneration?fetch(`${BACKEND_API_BASE}/api/camera/talkback?id=${encodeURIComponent(camId)}&action=start`,{method:'POST'}):null);
        const opened=await talkUploadChain;if(!opened)return;
        const opening=await opened.json();
        if(!opened.ok||!opening.ok)throw new Error(opening.error||'A câmera não confirmou a fala.');
        if(generation!==audioTalkGeneration)return;
        if(!isAudioTalking||activePtzCam!==camId){if(isAudioTalking)toggleAudioTalk();return;}
        if(text)text.innerText='Falar ativo';
        if(statusText)statusText.innerText='Canal de fala aberto. Verifique o som no alto-falante da câmera.';

        let activeTalkUploads = 0;
        const sendChunk = (blob) => {
          if (!blob || blob.size < 40 || !isAudioTalking || generation!==audioTalkGeneration) return;
          if (activeTalkUploads >= 2) return; // Limita a fila de envio para evitar acumular fala atrasada.
          activeTalkUploads++;
          const targetCamId = camId;
          const talkUrl = `${BACKEND_API_BASE}/api/camera/talkback?id=${encodeURIComponent(targetCamId)}`;
          talkUploadChain=talkUploadChain.catch(()=>{}).then(()=>{if(!isAudioTalking||audioTalkTarget!==targetCamId||generation!==audioTalkGeneration)return;return fetch(talkUrl, {
            method: 'POST',
            headers: {
              'Content-Type': blob.type || 'audio/webm'
            },
            body: blob
          }).then(async response=>{const result=await response.json();if(!response.ok||!result.ok)throw new Error(result.error||'Falha ao enviar áudio à câmera.');});}).catch(err => {
            if(isAudioTalking&&audioTalkTarget===targetCamId&&generation===audioTalkGeneration){toggleAudioTalk();showToast(err.message,'','⚠️','warning');}
            console.warn('[Talkback chunk send error]:', err.message);
          }).finally(() => {
            activeTalkUploads = Math.max(0, activeTalkUploads - 1);
          });
        };

        // Transmissão contínua em tempo real: Web Audio API com buffer PCM
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) {
          const actx = new AudioCtx({ sampleRate: 16000 });
          audioTalkCtx = actx;
          const micSource = actx.createMediaStreamSource(audioTalkStream);
          // 4096 amostras = 256ms a 16000Hz (latência baixíssima e voz limpa sem estalos)
          const scriptNode = actx.createScriptProcessor(4096, 1, 1);
          audioTalkScriptNode = scriptNode;

          // Ganho silencioso para acionar o pipeline de áudio do navegador sem retorno nos alto-falantes locais
          const silentGain = actx.createGain();
          silentGain.gain.value = 0;

          scriptNode.onaudioprocess = (audioEv) => {
            if (!isAudioTalking) return;
            const channel = audioEv.inputBuffer.getChannelData(0);
            const pcm16 = new Int16Array(channel.length);
            // Preserva as amostras captadas; os filtros do microfone são aplicados pelo navegador.
            for (let i = 0; i < channel.length; i++) {
              let s = channel[i];
              if (s > 1.0) s = 1.0;
              else if (s < -1.0) s = -1.0;
              pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }
            sendChunk(new Blob([pcm16.buffer], { type: `audio/pcm;rate=${actx.sampleRate || 16000}` }));
          };

          micSource.connect(scriptNode);
          scriptNode.connect(silentGain);
          silentGain.connect(actx.destination);
        } else {
          // Fallback MediaRecorder contínuo
          const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
            ? 'audio/webm;codecs=opus'
            : (MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '');
          const recorder = mimeType ? new MediaRecorder(audioTalkStream, { mimeType }) : new MediaRecorder(audioTalkStream);
          audioTalkRecorder = recorder;
          recorder.ondataavailable = e => {
            if (e.data && e.data.size > 0) sendChunk(e.data);
          };
          recorder.start(250);
        }

        showToast('Canal de fala conectado. Confirme o som na câmera.', '', '🎙️', 'success');

      } else {
        throw new Error('Microfone requer conexão segura HTTPS ou localhost.');
      }
    } catch (e) {
      console.warn('Permissão de microfone negada ou indisponível:', e.message);
      showToast(e.message || 'Microfone indisponível', '', '⚠️', 'warning');
      if (isAudioTalking && generation===audioTalkGeneration) {
        toggleAudioTalk();
      }
    }
  } else {
    ++audioTalkGeneration;
    // DESATIVAR MICROFONE INSTANTANEAMENTE (1 TOQUE)
    isAudioTalking = false;
    isPttTalking = false;
    if (audioTalkCycleTimeout) clearTimeout(audioTalkCycleTimeout);

    if (btn) {
      btn.classList.remove('active-talking');
      btn.style.background = '';
      btn.style.borderColor = '';
    }
    if (icon) icon.innerText = '🎙️';
    if (text) text.innerText = 'Falar (Microfone)';
    if (statusText) statusText.innerText = isAudioListening ? '🔊 Retorno de Som Ativo — Ouvindo ambiente' : 'Áudio Bidirecional: Microfone e Alto-Falante Prontos';
    if (waveMeter && !isAudioListening) waveMeter.style.display = 'none';

    try {
      if (audioTalkSocket) {
        const socket = audioTalkSocket;
        audioTalkSocket = null;
        try { socket.close(); } catch (e) {}
      }
      if (talkMutedListen) {
        talkMutedListen = false;
        if (!isAudioListening) toggleAudioListen();
      }
      if (audioTalkScriptNode) {
        try { audioTalkScriptNode.disconnect(); } catch (e) {}
        audioTalkScriptNode = null;
      }
      if (audioTalkCtx) {
        try { audioTalkCtx.close(); } catch (e) {}
        audioTalkCtx = null;
      }
      if (audioTalkRecorder && audioTalkRecorder.state !== 'inactive') {
        audioTalkRecorder.stop();
      }
      if (audioTalkStream) {
        audioTalkStream.getTracks().forEach(t => t.stop());
        audioTalkStream = null;
      }
    } catch (e) {}

    talkUploadChain=talkUploadChain.catch(()=>{}).then(()=>fetch(`${BACKEND_API_BASE}/api/camera/talkback?id=${encodeURIComponent(camId)}&action=stop`, {
      method: 'POST'
    })).catch(() => {});

    audioTalkTarget=null;
    showToast('Microfone desativado.', '', '🔇', 'info');
  }
}

// Aliases para retrocompatibilidade
function startPttTalk() { toggleAudioTalk(); }
function stopPttTalk() { if (isAudioTalking) toggleAudioTalk(); }

// =============================================================
// CONTROLE DE ABAS DO SURVEILLANCE THEATER (AO VIVO vs GRAVAÇÕES SD)
// =============================================================
let currentTheaterTab = 'live';

function switchTheaterTab(tab, skipAutoLoad = false) {
  const previousTab = currentTheaterTab;
  currentTheaterTab = tab;
  const btnLive = document.getElementById('tabBtnTheaterLive');
  const btnSd = document.getElementById('tabBtnTheaterSd');
  const panelLive = document.getElementById('theaterPanelLive');
  const panelSd = document.getElementById('theaterPanelSd');

  if (tab === 'live') {
    if (btnLive) btnLive.classList.add('active');
    if (btnSd) btnSd.classList.remove('active');
    if (panelLive) {
      panelLive.style.display = 'flex';
      panelLive.classList.add('active');
    }
    if (panelSd) {
      panelSd.style.display = 'none';
      panelSd.classList.remove('active');
    }

    // Encerra completamente o stream de gravação SD para liberar sessão P2P
    if (sdPlaybackTimer) {
      clearInterval(sdPlaybackTimer);
      sdPlaybackTimer = null;
    }
    const sdVideo = document.getElementById('sdPlaybackVideoElement');
    stopHttpVideoElement(sdVideo);
    stopHttpVideoElement(document.getElementById('sdPlaybackVideoElement2'));

    // Se estava na aba SD e voltou para Ao Vivo, reconecta o stream ao vivo
    if (previousTab === 'sd' && activePtzCam && !skipAutoLoad) {
      const camObj = (window._cachedCameras || []).find(c => c.id === activePtzCam) || { id: activePtzCam, sourceAlias: activePtzCam };
      const isOutdoorPro = (activePtzCam === 'outdoor_pro_poste' || (camObj.family && camObj.family.toLowerCase().includes('outdoor pro')));
      if (isOutdoorPro) {
        switchCameraViewMode(activeCameraViewMode || 'dual');
      } else {
        setupSingleCameraView(camObj);
      }
    }
  } else {
    if (btnLive) btnLive.classList.remove('active');
    if (btnSd) btnSd.classList.add('active');
    if (panelLive) {
      panelLive.style.display = 'none';
      panelLive.classList.remove('active');
    }
    if (panelSd) {
      panelSd.style.display = 'flex';
      panelSd.classList.add('active');
    }

    // Libera conexões HTTP de vídeo ao vivo para dedicar o canal P2P ao Playback SD (0x10D)
    if (dualSecondaryTimer) {
      clearTimeout(dualSecondaryTimer);
      dualSecondaryTimer = null;
    }
    stopStreamElement(document.getElementById('ptzMainVideoStream'));
    stopStreamElement(document.getElementById('ptzSecondaryVideoStream'));
    stopHttpVideoElement(document.getElementById('ptzMainVideoElement'));
    stopHttpVideoElement(document.getElementById('ptzSecondaryVideoElement'));

    // Atualiza gravações e inicia reprodução caso solicitado pela troca de aba
    if (activePtzCam && !skipAutoLoad) {
      fetchSdRecordings(activePtzCam, selectedTimelineDate, true);
    }
  }
}

// Momentos do cartão SD: abas por tipo e por período do dia, com horários compactos.
const sdEventView = { type: 'all', period: null };
function sdEventType(evt) {
  const label = String(evt.label || '').toLowerCase();
  if (/pessoa|humano|human|person/.test(label)) return 'person';
  if (/ve[ií]culo|carro|vehicle|car/.test(label)) return 'vehicle';
  if (/movimento|motion/.test(label)) return 'motion';
  return 'other';
}
function renderSdEvents(container, events) {
  container.style.display = 'block';
  if (!events.length) {
    container.innerHTML = '<span style="font-size:12px; color:var(--text-dim);">Nenhum momento registrado nesta data.</span>';
    return;
  }
  const types = { all: 'Todos', motion: '🏃 Movimento', person: '🚶 Pessoas', vehicle: '🚗 Veículos', other: '📼 Outros' };
  const periods = [['madrugada', '🌙 Madrugada', 0, 6], ['manha', '🌅 Manhã', 6, 12], ['tarde', '☀️ Tarde', 12, 18], ['noite', '🌆 Noite', 18, 24]];
  const typed = events.map(evt => ({ evt, type: sdEventType(evt), hour: Math.floor((evt.seconds || 0) / 3600) }));
  const ofType = typed.filter(x => sdEventView.type === 'all' || x.type === sdEventView.type);
  const counts = Object.fromEntries(periods.map(([id, , from, to]) => [id, ofType.filter(x => x.hour >= from && x.hour < to).length]));
  if (!sdEventView.period || !counts[sdEventView.period]) sdEventView.period = [...periods].reverse().find(([id]) => counts[id])?.[0] || 'madrugada';
  const typeTabs = Object.entries(types).filter(([id]) => id === 'all' || typed.some(x => x.type === id));
  const chip = (active, label, onclick) => `<button type="button" class="sd-event-tab${active ? ' active' : ''}" onclick="${onclick}">${label}</button>`;
  const period = periods.find(([id]) => id === sdEventView.period);
  const shown = ofType.filter(x => x.hour >= period[2] && x.hour < period[3]);
  container.innerHTML = `
    ${typeTabs.length > 2 ? `<div class="sd-event-tabs">${typeTabs.map(([id, label]) => chip(sdEventView.type === id, `${label} <small>${id === 'all' ? typed.length : typed.filter(x => x.type === id).length}</small>`, `sdEventView.type='${id}';renderSdEvents(this.closest('#timelineEventsContainer'), window.__sdEvents)`)).join('')}</div>` : ''}
    <div class="sd-event-tabs">${periods.map(([id, label]) => chip(sdEventView.period === id, `${label} <small>${counts[id]}</small>`, `sdEventView.period='${id}';renderSdEvents(this.closest('#timelineEventsContainer'), window.__sdEvents)`)).join('')}</div>
    <div class="sd-event-grid">${shown.length ? shown.map(({ evt, type }) => `<button type="button" class="sd-event-time sd-event-${type}" title="${String(evt.label || '').replace(/"/g, '')}" onclick="jumpToSdEvent(${evt.seconds}, '${String(evt.label || '').replace(/'/g, '')}', ${evt.unix || 0})">${String(evt.time || '').slice(0, 5)}</button>`).join('') : '<span style="font-size:12px; color:var(--text-dim);">Nenhum momento neste período.</span>'}</div>`;
  window.__sdEvents = events;
}

// Outdoor Pro: the SD card keeps one recording per lens (channel 0 and 1). The view switch picks the lens;
// "Dupla Visão" shows one timeline lane per lens and the clicked lane chooses what plays.
let sdPlayLens = '0';
const sdLensLabel = lens => (lens === '1' ? 'Vista 2' : 'Vista 1');
function sdHasTwoLenses() {
  const selector = document.getElementById('ptzViewModeSelector');
  return !!selector && selector.style.display !== 'none';
}
function sdLensesShown() {
  if (!sdHasTwoLenses()) return ['0'];
  if (activeCameraViewMode === 'view1') return ['0'];
  if (activeCameraViewMode === 'view2') return ['1'];
  return ['0', '1'];
}
// Dupla Visão on the recordings tab replays both lenses side by side from one camera session.
function sdDualPlayback() {
  return sdHasTwoLenses() && activeCameraViewMode === 'dual';
}
let sdPlayToken = 0;
function markSdLaneActive() {
  document.querySelectorAll('.timeline-lane-label').forEach(el => el.classList.toggle('active', el.dataset.lens === sdPlayLens));
}

// Régua de 24 Horas e Gravações SD Card
async function fetchSdRecordings(camId, date, autoPlayOnLoad = false) {
  const track = document.getElementById('timelineTrack');
  const storageBadge = document.getElementById('sdStorageBadge');
  const tabSdCapacityBadge = document.getElementById('tabSdCapacityBadge');
  const eventsContainer = document.getElementById('timelineEventsContainer');
  const healthTitle = document.getElementById('sdCardHealthTitle');
  const healthSub = document.getElementById('sdCardHealthSub');
  const storageUsageText = document.getElementById('sdStorageUsageText');
  const storageFreeText = document.getElementById('sdStorageFreeText');
  const recordingModeText = document.getElementById('sdRecordingModeText');
  const eventsCountBadge = document.getElementById('sdEventsCountBadge');
  const liveSdQuickInfo = document.getElementById('liveSdQuickInfo');

  try {
    const lenses = sdLensesShown();
    if (!lenses.includes(sdPlayLens)) sdPlayLens = lenses[0];
    const responses = await Promise.all(lenses.map(lens =>
      fetch(`${BACKEND_API_BASE}/api/camera/recordings?id=${encodeURIComponent(camId)}&date=${encodeURIComponent(date)}&channel=${lens}`)
        .then(r => r.json()).catch(() => null)));
    const data = responses[lenses.indexOf(sdPlayLens)] || responses.find(Boolean);
    if (!data) throw new Error('Cartão SD sem resposta');
    currentSdRecordings = data.periods || [];

    const totalGb = (data.storageTotalMb / 1024).toFixed(0);
    const usedGb = (data.storageUsedMb / 1024).toFixed(1);
    const freeGb = Math.max(0, (data.storageTotalMb - data.storageUsedMb) / 1024).toFixed(1);
    const health = data.sdHealth || '100% Saudável (MIoT Normal)';
    const pct = Math.min(100, Math.max(0, Math.round((data.storageUsedMb / Math.max(1, data.storageTotalMb)) * 100)));

    if (storageBadge) storageBadge.innerText = `MicroSD ${usedGb}GB / ${totalGb}GB (${health})`;
    if (tabSdCapacityBadge) tabSdCapacityBadge.innerText = `MICROSD ${totalGb}GB (${pct}%)`;
    if (healthTitle) healthTitle.innerText = `${totalGb} GB MicroSD High Endurance`;
    if (healthSub) healthSub.innerText = `${health}`;
    if (storageUsageText) storageUsageText.innerText = `${usedGb} GB Usado (${pct}%)`;
    if (storageFreeText) storageFreeText.innerText = `${freeGb} GB Livre de ${totalGb} GB`;
    if (recordingModeText) recordingModeText.innerText = data.recordingMode || '24/7 Contínua Circular (Loop)';
    if (eventsCountBadge) eventsCountBadge.innerText = `${(data.events || []).length} Momentos Disponíveis`;
    if (liveSdQuickInfo) liveSdQuickInfo.innerText = `MicroSD ${totalGb}GB (${usedGb}GB ocupado) • ${(data.events || []).length} momentos`;

    // Renderiza blocos de gravação contínua + marcadores de movimento destacados na régua (uma faixa por lente)
    if (track) {
      const dual = lenses.length > 1;
      const ruler = document.getElementById('timelineRulerContainer');
      if (ruler) ruler.classList.toggle('dual-lanes', dual);
      track.innerHTML = lenses.map((lens, i) => {
        const laneData = responses[i];
        if (!laneData) return '';
        const lane = dual ? ` lane-${i}` : '';
        const prefix = sdHasTwoLenses() ? `${sdLensLabel(lens)} • ` : '';
        const baseBlocks = (laneData.periods || []).map(p => {
          const leftPct = (p.start / 86400) * 100;
          const widthPct = Math.max(0.5, ((p.end - p.start) / 86400) * 100);
          return `<div class="timeline-block${lane}" onclick="seekTimelineClick(event)" style="left:${leftPct}%; width:${widthPct}%; background:#10b981; opacity:0.65; cursor:pointer;" title="${prefix}Gravação Contínua SD: ${p.label || (formatSecondsToTime(p.start) + ' - ' + formatSecondsToTime(p.end))}"></div>`;
        }).join('');

        // Marcadores verticais dourados/laranja de movimento detectado
        const motionMarkers = (laneData.daySegments || []).filter(s => s.m > 0).map(s => {
          const leftPct = (s.s / 86400) * 100;
          const widthPct = Math.max(0.35, ((s.d || 60) / 86400) * 100);
          return `<div class="timeline-motion-marker${lane}" onclick="seekTimelineExact(${s.s}, ${s.u}, event, '${lens}')" style="position:absolute; left:${leftPct}%; width:${widthPct}%; height:100%; background:#f59e0b; border-radius:2px; z-index:3; cursor:pointer;" title="⚡ ${prefix}Movimento Detectado às ${formatSecondsToTime(s.s)}"></div>`;
        }).join('');
        const label = dual ? `<span class="timeline-lane-label lane-${i}${lens === sdPlayLens ? ' active' : ''}" data-lens="${lens}">${sdLensLabel(lens)}</span>` : '';
        return baseBlocks + motionMarkers + label;
      }).join('');
    }

    // Renderiza os momentos do cartão SD agrupados por tipo e período do dia
    if (eventsContainer) renderSdEvents(eventsContainer, data.events || []);

    if (autoPlayOnLoad && currentTheaterTab === 'sd') {
      const events = data.events || [];
      const defaultSec = events.length > 0 ? events[0].seconds : Math.max(60, (data.maxAvailableSec || 36000) - 300);
      const defaultLabel = events.length > 0 ? events[0].label : 'Gravação MicroSD';
      const defaultUnix = events.length > 0 ? events[0].unix : 0;
      playCurrentSdSegment(defaultSec, defaultLabel, defaultUnix);
    }
  } catch (e) {
    if (track) track.innerHTML = '';
  }
}

let sdPlaybackTimer = null;
let currentSdPlaySeconds = 36000;
let currentPlaybackSpeed = 1;

function seekTimelineExact(seconds, unixTs, event, lens) {
  if (event) event.stopPropagation();
  if (lens) sdPlayLens = String(lens);
  switchTheaterTab('sd', true);
  const needle = document.getElementById('timelineNeedle');
  const timeTip = document.getElementById('timelineNeedleTime');
  const pct = Math.max(0, Math.min(100, (seconds / 86400) * 100));
  if (needle) needle.style.left = `${pct}%`;
  const formatted = formatSecondsToTime(seconds);
  if (timeTip) timeTip.innerText = formatted;
  showToast(`Momento: ${formatted} (Movimento SD) 📼`, '', '🎯', 'info');
  playCurrentSdSegment(seconds, 'Movimento Detectado', unixTs);
}

function jumpToSdEvent(seconds, label, unixTs) {
  switchTheaterTab('sd', true);
  const needle = document.getElementById('timelineNeedle');
  const timeTip = document.getElementById('timelineNeedleTime');
  const pct = Math.max(0, Math.min(100, (seconds / 86400) * 100));
  if (needle) needle.style.left = `${pct}%`;
  const formatted = formatSecondsToTime(seconds);
  if (timeTip) timeTip.innerText = formatted;
  showToast(`Momento: ${label} (${formatted}) — Reproduzindo 📼`, '', '🎯', 'info');
  playCurrentSdSegment(seconds, label, unixTs);
}

function seekTimelineClick(event) {
  if (event) event.stopPropagation();
  switchTheaterTab('sd', true);
  const ruler = document.getElementById('timelineRulerContainer');
  const needle = document.getElementById('timelineNeedle');
  const timeTip = document.getElementById('timelineNeedleTime');
  if (!ruler || !needle) return;

  const rect = ruler.getBoundingClientRect();
  if (ruler.classList.contains('dual-lanes')) sdPlayLens = (event.clientY - rect.top) < rect.height / 2 ? '0' : '1';
  const clickX = event.clientX - rect.left;
  const pct = Math.max(0, Math.min(100, (clickX / rect.width) * 100));
  needle.style.left = `${pct}%`;

  const totalSeconds = Math.round((pct / 100) * 86400);
  const formatted = formatSecondsToTime(totalSeconds);
  if (timeTip) timeTip.innerText = formatted;

  showToast(`Posicionado em: ${formatted} (Gravação SD) 📼`, '', '📼', 'info');
  playCurrentSdSegment(totalSeconds);
}

function stepTimelineDay(delta) {
  const d = new Date(selectedTimelineDate + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  selectedTimelineDate = d.toISOString().slice(0, 10);
  const dateInput = document.getElementById('timelineDateInput');
  if (dateInput) dateInput.value = selectedTimelineDate;
  fetchSdRecordings(activePtzCam, selectedTimelineDate, currentTheaterTab === 'sd');
  showToast(`Carregando gravações de: ${selectedTimelineDate}`, '', '📅', 'info');
}

function stepTimelineToday() {
  selectedTimelineDate = new Date().toISOString().slice(0, 10);
  const dateInput = document.getElementById('timelineDateInput');
  if (dateInput) dateInput.value = selectedTimelineDate;
  fetchSdRecordings(activePtzCam, selectedTimelineDate, currentTheaterTab === 'sd');
  showToast('Linha do tempo atualizada para HOJE 📅', '', '📅', 'info');
}

function onTimelineDateChanged(val) {
  if (!val) return;
  selectedTimelineDate = val;
  fetchSdRecordings(activePtzCam, selectedTimelineDate, currentTheaterTab === 'sd');
}

async function setPlaybackSpeed(speed, btnEl) {
  currentPlaybackSpeed = speed;
  const pills = document.querySelectorAll('.speed-pill');
  pills.forEach(p => p.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  const camId = activePtzCam || 'outdoor_pro_poste';
  for (const id of ['sdPlaybackVideoElement', 'sdPlaybackVideoElement2']) {
    const el = document.getElementById(id);
    if (el) try { el.playbackRate = speed; } catch {}
  }

  try {
    await fetch(`${BACKEND_API_BASE}/api/camera/recordings/speed?id=${encodeURIComponent(camId)}&speed=${speed}`, { method: 'POST' });
  } catch (e) {}

  showToast(`Velocidade de reprodução: ${speed}x ⏩`);
}

function playCurrentSdSegment(targetSeconds, optLabel, optUnix) {
  if (currentTheaterTab !== 'sd') {
    switchTheaterTab('sd', true);
  }
  let seconds = targetSeconds;
  if (seconds === undefined) {
    const needleTip = document.getElementById('timelineNeedleTime');
    if (needleTip && needleTip.innerText) {
      const parts = needleTip.innerText.split(':').map(Number);
      seconds = (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
    } else {
      seconds = 36000;
    }
  }

  currentSdPlaySeconds = seconds;
  const time = formatSecondsToTime(seconds);
  const sdVideo = document.getElementById('sdPlaybackVideoElement');
  const spinner = document.getElementById('sdPlaybackSpinner');
  const overlayText = document.getElementById('sdPlaybackOverlayText');

  const labelSuffix = optLabel ? ` — ${optLabel}` : '';
  const dual = sdDualPlayback();
  const playToken = ++sdPlayToken;
  const lensPrefix = dual ? 'Vista 1 • ' : (sdHasTwoLenses() ? `${sdLensLabel(sdPlayLens)} • ` : '');
  const row = document.getElementById('sdPlayerRow');
  const wrap2 = document.getElementById('sdPlayerWrap2');
  const sdVideo2 = document.getElementById('sdPlaybackVideoElement2');
  const spinner2 = document.getElementById('sdPlaybackSpinner2');
  stopHttpVideoElement(sdVideo2);
  if (row) row.classList.toggle('dual', dual);
  if (wrap2) wrap2.style.display = dual ? 'flex' : 'none';
  if (overlayText) overlayText.innerText = `● GRAVAÇÃO SD • ${lensPrefix}${selectedTimelineDate} ${time}${labelSuffix}`;
  markSdLaneActive();
  if (spinner) spinner.style.display = 'block';

  // Atualiza posição da agulha na régua
  const needle = document.getElementById('timelineNeedle');
  const timeTip = document.getElementById('timelineNeedleTime');
  const pct = Math.max(0, Math.min(100, (seconds / 86400) * 100));
  if (needle) needle.style.left = `${pct}%`;
  if (timeTip) timeTip.innerText = time;

  if (sdVideo) {
    stopHttpVideoElement(sdVideo);
    sdVideo.style.display = 'block';
    const camId = activePtzCam || 'outdoor_pro_poste';
    sdVideo.playsInline = true;
    sdVideo.autoplay = true;
    sdVideo.muted = !isAudioListening;
    // Both lenses must ask for the same instant: the bridge keys the shared replay by it.
    let unix = (optUnix && optUnix > 1577836800) ? optUnix : 0;
    if (dual && !unix) unix = Math.min(Math.floor(Date.now() / 1000) - 90, Math.floor(new Date(`${selectedTimelineDate}T00:00:00-03:00`).getTime() / 1000) + seconds);
    const unixParam = unix ? `&unix=${unix}` : '';
    const streamUrl = lens => `${BACKEND_API_BASE}/api/camera/recordings/stream?id=${encodeURIComponent(camId)}&date=${encodeURIComponent(selectedTimelineDate)}&time=${encodeURIComponent(time)}&sec=${seconds}${unixParam}&speed=${currentPlaybackSpeed}&channel=${lens}${dual ? '&dual=1' : ''}&t=${Date.now()}`;
    sdVideo.src = streamUrl(dual ? '0' : sdPlayLens);
    sdVideo.load();
    const p = sdVideo.play();
    if (p) p.catch(() => {
      sdVideo.muted = true;
      sdVideo.play().catch(() => {});
    });
    let secondStarted = false;
    const onReady = () => {
      if (spinner) spinner.style.display = 'none';
      startSdTimelineTracking();
      // The second lens joins the replay session the first one opened.
      if (!dual || secondStarted || playToken !== sdPlayToken || !sdVideo2) return;
      secondStarted = true;
      const overlay2 = document.getElementById('sdPlaybackOverlayText2');
      if (overlay2) overlay2.innerText = `● GRAVAÇÃO SD • Vista 2 • ${selectedTimelineDate} ${time}`;
      if (spinner2) spinner2.style.display = 'block';
      sdVideo2.style.display = 'block';
      sdVideo2.muted = true;
      sdVideo2.playsInline = true;
      sdVideo2.src = streamUrl('1');
      sdVideo2.load();
      sdVideo2.play().catch(() => {});
      const ready2 = () => { if (spinner2) spinner2.style.display = 'none'; };
      sdVideo2.onplaying = ready2;
      sdVideo2.onloadeddata = ready2;
      sdVideo2.onerror = ready2;
    };
    sdVideo.onplaying = onReady;
    sdVideo.oncanplay = onReady;
    sdVideo.onloadeddata = onReady;
    sdVideo.onerror = () => {
      if (spinner) spinner.style.display = 'none';
    };
  }
  showToast(`Reproduzindo gravação SD: ${time}${labelSuffix} ▶️`, '', '📼', 'info');
}

function startSdTimelineTracking() {
  if (sdPlaybackTimer) clearInterval(sdPlaybackTimer);
  sdPlaybackTimer = setInterval(() => {
    const sdVideo = document.getElementById('sdPlaybackVideoElement');
    if (!sdVideo || sdVideo.paused || sdVideo.ended) return;

    currentSdPlaySeconds = (currentSdPlaySeconds + 1) % 86400;
    const formatted = formatSecondsToTime(currentSdPlaySeconds);
    const needle = document.getElementById('timelineNeedle');
    const timeTip = document.getElementById('timelineNeedleTime');
    const overlayText = document.getElementById('sdPlaybackOverlayText');
    const pct = (currentSdPlaySeconds / 86400) * 100;

    if (needle) needle.style.left = `${pct}%`;
    if (timeTip) timeTip.innerText = formatted;
    const lensPrefix = sdDualPlayback() ? 'Vista 1 • ' : (sdHasTwoLenses() ? `${sdLensLabel(sdPlayLens)} • ` : '');
    if (overlayText) overlayText.innerText = `● GRAVAÇÃO SD • ${lensPrefix}${selectedTimelineDate} ${formatted} (MicroSD Reprodução)`;
    const overlay2 = document.getElementById('sdPlaybackOverlayText2');
    if (overlay2 && sdDualPlayback()) overlay2.innerText = `● GRAVAÇÃO SD • Vista 2 • ${selectedTimelineDate} ${formatted}`;
  }, 1000);
}

function downloadCurrentSdClip() {
  const formatted = formatSecondsToTime(currentSdPlaySeconds);
  const url = `${BACKEND_API_BASE}/api/camera/recordings/clip?id=${encodeURIComponent(activePtzCam || 'outdoor_pro_poste')}&date=${encodeURIComponent(selectedTimelineDate)}&time=${encodeURIComponent(formatted)}&sec=${currentSdPlaySeconds}&channel=${sdPlayLens}`;
  window.open(url, '_blank');
  showToast(`Exportação do clipe MP4 (${formatted}) iniciada! 💾`);
}

function captureSdSnapshot() {
  const sdVideo = document.getElementById('sdPlaybackVideoElement');
  try {
    if (sdVideo && sdVideo.videoWidth > 0) {
      const canvas = document.createElement('canvas');
      canvas.width = sdVideo.videoWidth;
      canvas.height = sdVideo.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(sdVideo, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
      triggerFileDownload(dataUrl, `gravacao-sd-${activePtzCam}-${Date.now()}.jpg`);
      showToast('📸 Foto da gravação capturada em alta resolução!');
      return;
    }
  } catch (e) {}

  window.open(`${BACKEND_API_BASE}/api/camera-frame?src=${encodeURIComponent(activePtzCam || 'outdoor_pro_poste')}&download=1`, '_blank');
  showToast('📸 Foto da gravação baixada!');
}

function formatSecondsToTime(sec) {
  const h = Math.floor(sec / 3600).toString().padStart(2, '0');
  const m = Math.floor((sec % 3600) / 60).toString().padStart(2, '0');
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function closePtzModal() {
  const modal = document.getElementById('cameraPtzModal');
  if (modal) modal.classList.remove('active');

  if (dualSecondaryTimer) {
    clearTimeout(dualSecondaryTimer);
    dualSecondaryTimer = null;
  }

  stopStreamElement(document.getElementById('ptzMainVideoStream'));
  stopStreamElement(document.getElementById('ptzSecondaryVideoStream'));
  stopHttpVideoElement(document.getElementById('ptzMainVideoElement'));
  stopHttpVideoElement(document.getElementById('ptzSecondaryVideoElement'));
  stopHttpVideoElement(document.getElementById('sdPlaybackVideoElement'));

  if (sdPlaybackTimer) {
    clearInterval(sdPlaybackTimer);
    sdPlaybackTimer = null;
  }
  if (isAudioTalking) toggleAudioTalk();
  else if (isPttTalking) stopPttTalk();
  if (isAudioListening) toggleAudioListen();
  activePtzCam = null;
}

// Carrega Câmeras Xiaomi (Lazy load com Overlays de Ações Rápidas Personalizáveis)
async function fetchCameras() {
  const grid = document.getElementById('camerasGrid');
  if (!grid) return;

  try {
    const res = await fetch('/api/cameras');
    const data = await res.json();
    window._cachedCameras = data.cameras || [];
    if (!data.cameras || data.cameras.length === 0) {
      grid.innerHTML = '<div style="color:var(--text-dim); text-align:center; padding:40px;">Nenhuma câmera configurada.</div>';
      return;
    }

    grid.innerHTML = data.cameras.map(cam => {
      const alias = cam.sourceAlias || cam.id;
      const isGateCam = cam.id.includes('portao') || cam.id.includes('garagem') || (cam.name && (cam.name.toLowerCase().includes('portão') || cam.name.toLowerCase().includes('garagem')));
      const isPtz = (cam.id === 'outdoor_pro_poste' || (cam.family && cam.family.toLowerCase().includes('outdoor pro')) || (cam.name && cam.name.toLowerCase().includes('outdoor pro')));
      const streamUrl = `${BACKEND_API_BASE}/api/camera-frame?src=${encodeURIComponent(alias)}`;
      const fallbackSvg = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360' viewBox='0 0 640 360'><rect width='640' height='360' fill='%23090d16'/><circle cx='320' cy='150' r='40' fill='none' stroke='%2338bdf8' stroke-width='3' stroke-dasharray='6 6'/><polygon points='310,135 335,150 310,165' fill='%2338bdf8'/><text x='320' y='225' font-family='sans-serif' font-size='15' font-weight='600' fill='%23f8fafc' text-anchor='middle'>CÂMERA EM STANDBY</text></svg>";

      // Atalhos sobrepostos no preview (Apenas atalhos personalizados pelo usuário, sem botões padrão que já existem no rodapé)
      let floatingActions = '';

      // Adiciona apenas atalhos extras que o usuário marcou explicitamente como "Exibir nas Câmeras"
      const userShortcuts = getCustomShortcuts().filter(s => s.showCameras && s.type !== 'gate');
      userShortcuts.forEach(sc => {
        floatingActions += `
          <button class="cam-btn-floating" onclick="executeCustomShortcut('${sc.id}'); event.stopPropagation();" title="${sc.name}">
            ${sc.icon || '⚡'} ${sc.name}
          </button>
        `;
      });

      return `
        <div class="camera-card" data-cam-id="${cam.id}">
          <div class="camera-preview" onclick="openPtzModal('${cam.id}')" style="cursor:pointer;">
            <img src="${streamUrl}" alt="${cam.name}" loading="lazy" style="background:#000; width:100%; height:100%; object-fit:contain !important; display:block;" onerror="this.onerror=null; this.src='${fallbackSvg}';">
            <div class="camera-overlay-badge">
              <span class="pulse-dot"></span>
              AO VIVO • ${isPtz ? 'DUPLO SENSOR 3K' : (cam.family || '2K NATIVA')}
            </div>

            <!-- Atalhos Sobrepostos Limpos e Personalizados -->
            <div class="cam-preview-overlay-actions">
              ${floatingActions}
            </div>
          </div>
          <div class="camera-footer">
            <div>
              <div class="camera-name">${cam.name}</div>
              <div class="camera-info">go2rtc: ${alias} • ${isPtz ? '3K Motorizada Dual' : '2K Lente Fixa'}</div>
            </div>
            <div style="display: flex; gap: 6px;">
              ${isGateCam ? `
                <button class="btn btn-secondary" onclick="pulseGate()" style="padding: 6px 10px; font-size: 11px;">
                  🚪 Portão
                </button>
              ` : ''}
              <button class="btn btn-primary" onclick="openPtzModal('${cam.id}')" style="padding: 6px 12px; font-size: 11px;">
                ${isPtz ? '📺 Dupla Visão & PTZ' : '👁️ Monitorar & Áudio'}
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
    applyCameraFocus();
    camerasLoadedOnce = true;
  } catch (err) {
    console.error('Erro ao carregar câmeras:', err);
  }
}

// -------------------------------------------------------------
// Inicialização Geral Instantânea (0ms de espera com cache local)
// -------------------------------------------------------------
try {
  const cachedDev = localStorage.getItem('mizin_cached_devices');
  if (cachedDev) {
    devices = JSON.parse(cachedDev);
    renderQuickGrid();
    renderCustomShortcuts();
  }
} catch (e) {}

// Sincroniza dados e configurações com o servidor
fetchEnergy();
fetchDevices();
fetchLogs();
syncUiConfigFromServer();
renderGlanceBar();

// Loops de telemetria contínua
setInterval(fetchEnergy, 3000);
setInterval(fetchDevices, 8000);
setInterval(fetchLogs, 4000);
setInterval(syncUiConfigFromServer, 10000);

// =============================================================
// MOTOR DE CENAS & AUTOMAÇÕES INTELIGENTES (HOME ASSISTANT ENGINE)
// =============================================================
let currentScenes = [];
let currentAutomations = [];

async function fetchAutomations() {
  try {
    const res = await fetch('/api/automations');
    if (!res.ok) return;
    const data = await res.json();
    currentScenes = data.scenes || [];
    currentAutomations = data.automations || [];
    renderAutomationsTab();
  } catch (err) {
    console.error('[-] Erro ao carregar automações:', err);
  }
}

// Ações em edição nos modais
let editingSceneActions = [];
let editingAutoActions = [];

function renderAutomationsTab() {
  // 1. Renderizar Cenas de 1-Toque
  const scenesContainer = document.getElementById('scenesGridContainer');
  if (scenesContainer) {
    if (currentScenes.length === 0) {
      scenesContainer.innerHTML = '<div style="color:var(--text-muted); font-size:12px; padding:20px;">Nenhuma cena configurada ainda.</div>';
    } else {
      scenesContainer.innerHTML = currentScenes.map(scene => {
        // Prévia transparente das ações configuradas
        const actionsPreviewHtml = (scene.actions || []).slice(0, 4).map(act => {
          const isPulse = act.dps === 'pulse' || String(act.dps) === '1' && act.name?.toLowerCase().includes('portão');
          const isOn = act.value === true;
          const badgeClass = isPulse ? 'pulse' : (isOn ? 'on' : 'off');
          const stateLabel = isPulse ? 'Pulso' : (isOn ? 'Ligar' : 'Desligar');
          return `<span class="scene-action-badge ${badgeClass}" title="${act.name || act.devId} ➔ ${stateLabel}">${act.name || 'Aparelho'}: ${stateLabel}</span>`;
        }).join('') + ((scene.actions || []).length > 4 ? `<span class="scene-action-badge">+${scene.actions.length - 4}</span>` : '');

        return `
          <div class="scene-card" onclick="openEditSceneModal('${scene.id}')" title="Clique para detalhes e edição da cena: ${scene.name}">
            <div class="scene-header-row">
              <div class="scene-icon-wrap">${scene.icon || '🎬'}</div>
              <div class="scene-info">
                <h4 class="scene-title">${scene.name}</h4>
                <div class="scene-desc">${scene.description || ''}</div>
              </div>
            </div>

            <!-- Prévia dos Aparelhos e Ações -->
            <div class="scene-actions-preview">
              ${actionsPreviewHtml || '<span style="font-size:10px; color:var(--text-dim);">Sem ações atribuídas</span>'}
            </div>

            <div class="scene-footer">
              <div class="scene-footer-left">
                <span class="scene-action-count">${(scene.actions || []).length} aparelhos</span>
                <button class="btn-scene-edit" onclick="event.stopPropagation(); openEditSceneModal('${scene.id}')" title="Ver detalhes, editar ações e aparelhos">
                  ⚙️ Editar
                </button>
              </div>
              <div class="scene-footer-right">
                <button class="btn-scene-run" onclick="event.stopPropagation(); executeScene('${scene.id}')" title="Disparar esta cena agora">
                  ▶ Ativar
                </button>
                <button class="btn-icon-del" onclick="event.stopPropagation(); deleteScene('${scene.id}')" title="Excluir Cena">
                  🗑️
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // 2. Renderizar Automações Ativas
  const autosContainer = document.getElementById('automationsListContainer');
  if (autosContainer) {
    if (currentAutomations.length === 0) {
      autosContainer.innerHTML = '<div style="color:var(--text-muted); font-size:12px; padding:20px;">Nenhuma regra de automação criada.</div>';
    } else {
      autosContainer.innerHTML = currentAutomations.map(auto => {
        const actionsPreviewHtml = (auto.actions || []).slice(0, 3).map(act => {
          const isPulse = act.dps === 'pulse' || String(act.dps) === '1' && act.name?.toLowerCase().includes('portão');
          const isOn = act.value === true;
          const badgeClass = isPulse ? 'pulse' : (isOn ? 'on' : 'off');
          const stateLabel = isPulse ? 'Pulso' : (isOn ? 'Ligar' : 'Desligar');
          return `<span class="scene-action-badge ${badgeClass}">${act.name || 'Aparelho'}: ${stateLabel}</span>`;
        }).join('') + ((auto.actions || []).length > 3 ? `<span class="scene-action-badge">+${auto.actions.length - 3}</span>` : '');

        return `
          <div class="automation-card">
            <div class="automation-main">
              <div class="automation-icon-box">${auto.icon || '⚡'}</div>
              <div class="automation-details" style="flex:1;">
                <div class="automation-name">
                  <span>${auto.name}</span>
                  <span class="badge ${auto.enabled ? 'badge-emerald' : 'badge-neutral'}" style="font-size:10px; padding:1px 6px;">
                    ${auto.enabled ? 'ATIVADA' : 'PAUSADA'}
                  </span>
                </div>
                <div class="automation-trigger-desc">
                  ${auto.triggerDescription || auto.actionDescription || ''}
                </div>
                ${auto.actionDescription && auto.actionDescription !== auto.triggerDescription ? `<div style="font-size:11px; color:var(--text-dim); margin-top:2px;">➔ Processo: ${auto.actionDescription}</div>` : ''}
                
                ${actionsPreviewHtml ? `<div class="scene-actions-preview" style="margin-top:4px;">${actionsPreviewHtml}</div>` : ''}

                <div class="automation-meta-chips">
                  <span class="meta-chip meta-chip-cyan">Condição: ${auto.condition || 'Sem restrições'}</span>
                  <span class="meta-chip meta-chip-emerald">Execuções: ${auto.totalExecutions || 0}</span>
                  ${auto.lastTriggered ? `<span class="meta-chip">Última: ${new Date(auto.lastTriggered).toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}</span>` : ''}
                </div>
              </div>
            </div>

            <div class="automation-controls">
              <button class="btn btn-sm btn-outline-cyan" onclick="executeAutomation('${auto.id}')" title="Executar imediatamente esta regra">
                ▶ Executar
              </button>
              <button class="btn-scene-edit" onclick="openEditAutomationModal('${auto.id}')" title="Ver detalhes e editar automação">
                ⚙️ Editar
              </button>
              <label class="ha-switch" title="${auto.enabled ? 'Pausar automação' : 'Ativar automação'}">
                <input type="checkbox" ${auto.enabled ? 'checked' : ''} onchange="toggleAutomation('${auto.id}')">
                <span class="ha-slider"></span>
              </label>
              <button class="btn-icon-del" onclick="deleteAutomation('${auto.id}')" title="Excluir Automação">
                🗑️
              </button>
            </div>
          </div>
        `;
      }).join('');
    }
  }
}

async function executeScene(sceneId) {
  try {
    showToast('Executando cena...', 'info');
    const res = await fetch(`/api/scenes/${sceneId}/execute`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(`🎬 Cena "${data.scene?.name || sceneId}" ativada com sucesso!`, 'success');
      fetchDevices();
      fetchLogs();
    } else {
      showToast(`[-] Falha ao executar cena: ${data.error}`, 'error');
    }
  } catch (err) {
    showToast(`[-] Erro de conexão: ${err.message}`, 'error');
  }
}

async function toggleAutomation(autoId) {
  try {
    const res = await fetch(`/api/automations/${autoId}/toggle`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(`Automação "${data.auto?.name}" ${data.auto?.enabled ? 'ativada' : 'pausada'}`, 'success');
      fetchAutomations();
      fetchLogs();
    }
  } catch (err) {
    showToast(`Erro ao alternar automação: ${err.message}`, 'error');
  }
}

async function executeAutomation(autoId) {
  try {
    showToast('Disparando automação...', 'info');
    const res = await fetch(`/api/automations/${autoId}/execute`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast(`🤖 Automação "${data.auto?.name}" executada com sucesso!`, 'success');
      fetchAutomations();
      fetchDevices();
      fetchLogs();
    }
  } catch (err) {
    showToast(`Erro ao executar automação: ${err.message}`, 'error');
  }
}

// =============================================================
// MODAL DE EDIÇÃO E CRIAÇÃO DE CENAS (FULL CRUD & TRANSPARÊNCIA)
// =============================================================
function populateDeviceDropdown(selectElId) {
  const sel = document.getElementById(selectElId);
  if (!sel) return;
  sel.innerHTML = devices.map(d => {
    const roomStr = d.room ? ` [${d.room}]` : '';
    return `<option value="${d.id}">${d.name}${roomStr}</option>`;
  }).join('');
}

function openCreateSceneModal() {
  openEditSceneModal(null);
}

function openEditSceneModal(sceneId) {
  populateDeviceDropdown('sceneNewDevSelect');
  const modal = document.getElementById('editSceneModal');
  const btnDel = document.getElementById('btnDeleteSceneModal');

  if (sceneId) {
    const scene = currentScenes.find(s => s.id === sceneId);
    if (!scene) return;
    document.getElementById('editSceneId').value = scene.id;
    document.getElementById('editSceneName').value = scene.name;
    document.getElementById('editSceneIcon').value = scene.icon || '🎬';
    document.getElementById('modalSceneIconBadge').innerText = scene.icon || '🎬';
    document.getElementById('modalSceneTitle').innerText = `Editar Cena: ${scene.name}`;
    document.getElementById('editSceneDesc').value = scene.description || '';
    editingSceneActions = JSON.parse(JSON.stringify(scene.actions || []));
    if (btnDel) btnDel.style.display = 'inline-flex';
  } else {
    document.getElementById('editSceneId').value = 'scene_' + Date.now();
    document.getElementById('editSceneName').value = '';
    document.getElementById('editSceneIcon').value = '✨';
    document.getElementById('modalSceneIconBadge').innerText = '✨';
    document.getElementById('modalSceneTitle').innerText = 'Criar Nova Cena Rápida';
    document.getElementById('editSceneDesc').value = '';
    editingSceneActions = [];
    if (btnDel) btnDel.style.display = 'none';
  }

  renderModalSceneActions();
  modal?.classList.add('active');
}

function closeEditSceneModal() {
  document.getElementById('editSceneModal')?.classList.remove('active');
}

function renderModalSceneActions() {
  const container = document.getElementById('sceneActionsContainer');
  const countLabel = document.getElementById('sceneActionCountLabel');
  if (countLabel) countLabel.innerText = editingSceneActions.length;
  if (!container) return;

  if (editingSceneActions.length === 0) {
    container.innerHTML = '<div style="color:var(--text-dim); font-size:11px; padding:10px; text-align:center;">Nenhum dispositivo adicionado nesta cena ainda. Utilize o formulário abaixo para incluir.</div>';
    return;
  }

  container.innerHTML = editingSceneActions.map((act, idx) => {
    const dev = devices.find(d => d.id === act.devId);
    const devName = act.name || dev?.name || act.devId;
    const isPulse = act.dps === 'pulse' || String(act.dps) === '1' && devName.toLowerCase().includes('portão');
    const isOn = act.value === true;
    const tagClass = isPulse ? 'tag-pulse' : (isOn ? 'tag-on' : 'tag-off');
    const tagText = isPulse ? '⚡ Pulso' : (isOn ? '🟢 Ligar' : '🔴 Desligar');
    const channelText = act.dps === 'all' ? 'Geral' : (act.dps === '16' ? 'Disjuntor' : `Canal ${act.dps}`);

    return `
      <div class="scene-action-row">
        <div class="scene-action-info">
          <span style="font-size:15px;">${getDeviceIcon(dev?.category)}</span>
          <div style="display:flex; flex-direction:column;">
            <span style="font-weight:600; color:var(--text-main);">${devName}</span>
            <span style="font-size:10px; color:var(--text-dim);">${dev?.room ? dev.room + ' • ' : ''}${channelText}</span>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="scene-action-tag ${tagClass}">${tagText}</span>
          <button type="button" class="btn-icon-del" onclick="removeSceneActionRow(${idx})" title="Remover esta ação da cena">✕</button>
        </div>
      </div>
    `;
  }).join('');
}

function addSceneActionRow() {
  const devSelect = document.getElementById('sceneNewDevSelect');
  const chSelect = document.getElementById('sceneNewChannelSelect');
  const valSelect = document.getElementById('sceneNewValSelect');

  const devId = devSelect?.value;
  const dps = chSelect?.value || '1';
  const valRaw = valSelect?.value;

  if (!devId) {
    alert('Selecione um aparelho para adicionar');
    return;
  }

  const dev = devices.find(d => d.id === devId);
  const devName = dev?.name || devId;
  const isGate = dev?.category === 'ckmkzq' || devName.toLowerCase().includes('portão');

  let value = valRaw === 'true';
  let targetDps = dps;
  if (isGate || valRaw === 'pulse') {
    targetDps = '1';
    value = true;
  }

  editingSceneActions.push({
    devId,
    dps: targetDps,
    value,
    name: devName
  });

  renderModalSceneActions();
  showToast('Ação incluída', `${devName} adicionado à cena`, 'info');
}

function removeSceneActionRow(idx) {
  editingSceneActions.splice(idx, 1);
  renderModalSceneActions();
}

async function saveEditScene() {
  const sceneId = document.getElementById('editSceneId')?.value.trim();
  const name = document.getElementById('editSceneName')?.value.trim();
  const icon = document.getElementById('editSceneIcon')?.value.trim() || '🎬';
  const desc = document.getElementById('editSceneDesc')?.value.trim();

  if (!name) {
    alert('Informe o nome da cena');
    return;
  }

  const scenePayload = {
    id: sceneId || ('scene_' + Date.now()),
    name,
    icon,
    description: desc || 'Cena residencial inteligente',
    actions: editingSceneActions
  };

  try {
    const res = await fetch(`/api/scenes/${scenePayload.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scenePayload)
    });
    const data = await res.json();
    if (data.success) {
      currentScenes = data.scenes || currentScenes;
      closeEditSceneModal();
      renderAutomationsTab();
      showToast('Cena Salva', `Cena "${name}" atualizada com sucesso!`, 'success');
    } else {
      alert('Erro ao salvar cena: ' + (data.error || 'Erro desconhecido'));
    }
  } catch (err) {
    alert('Erro de conexão ao salvar cena: ' + err.message);
  }
}

async function deleteScene(sceneId) {
  const scene = currentScenes.find(s => s.id === sceneId);
  const name = scene?.name || sceneId;
  if (!confirm(`Tem certeza que deseja excluir a cena "${name}"?`)) return;

  try {
    let res = await fetch(`/api/scenes/${sceneId}`, { method: 'DELETE' });
    if (!res.ok) {
      res = await fetch(`/api/scenes/${sceneId}?_method=DELETE`, { method: 'POST' });
    }
    const data = await res.json();
    if (data.success) {
      currentScenes = data.scenes || currentScenes.filter(s => s.id !== sceneId);
      renderAutomationsTab();
      showToast('Cena Removida', `A cena "${name}" foi excluída.`, 'info');
    } else {
      alert('Erro ao excluir cena: ' + (data.error || 'Erro desconhecido'));
    }
  } catch (err) {
    try {
      const resPost = await fetch(`/api/scenes/${sceneId}?_method=DELETE`, { method: 'POST' });
      const dataPost = await resPost.json();
      if (dataPost.success) {
        currentScenes = dataPost.scenes || currentScenes.filter(s => s.id !== sceneId);
        renderAutomationsTab();
        showToast('Cena Removida', `A cena "${name}" foi excluída.`, 'info');
        return;
      }
    } catch (e) {}
    alert('Erro ao excluir cena: ' + err.message);
  }
}

async function deleteSceneFromModal() {
  const sceneId = document.getElementById('editSceneId')?.value;
  if (!sceneId) return;
  await deleteScene(sceneId);
  closeEditSceneModal();
}

async function testSceneFromModal() {
  if (editingSceneActions.length === 0) {
    alert('Nenhuma ação na cena para testar!');
    return;
  }
  showToast('Testando Cena', `Executando ${editingSceneActions.length} ações em sequência...`, 'info');
  for (const act of editingSceneActions) {
    try {
      await fetch(`/api/device/${act.devId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dps: act.dps, value: act.value })
      });
    } catch (e) {}
  }
  fetchDevices();
  fetchLogs();
  showToast('Teste Concluído', 'Todas as ações foram transmitidas aos aparelhos!', 'success');
}

// =============================================================
// MODAL DE EDIÇÃO E CRIAÇÃO DE AUTOMAÇÕES (FULL CRUD)
// =============================================================
function openCreateAutomationModal() {
  openEditAutomationModal(null);
}

function openEditAutomationModal(autoId) {
  populateDeviceDropdown('autoNewDevSelect');
  const modal = document.getElementById('editAutomationModal');
  const btnDel = document.getElementById('btnDeleteAutoModal');

  if (autoId) {
    const auto = currentAutomations.find(a => a.id === autoId);
    if (!auto) return;
    document.getElementById('editAutoId').value = auto.id;
    document.getElementById('editAutoName').value = auto.name;
    document.getElementById('editAutoIcon').value = auto.icon || '🤖';
    document.getElementById('modalAutoIconBadge').innerText = auto.icon || '🤖';
    document.getElementById('modalAutoTitle').innerText = `Editar Automação: ${auto.name}`;
    document.getElementById('editAutoEnabled').checked = auto.enabled !== false;
    document.getElementById('editAutoTriggerType').value = auto.triggerType || 'custom';
    document.getElementById('editAutoTriggerDesc').value = auto.triggerDescription || '';
    document.getElementById('editAutoCondition').value = auto.condition || '';
    document.getElementById('editAutoActionDesc').value = auto.actionDescription || '';
    editingAutoActions = JSON.parse(JSON.stringify(auto.actions || []));
    if (btnDel) btnDel.style.display = 'inline-flex';
  } else {
    document.getElementById('editAutoId').value = 'auto_' + Date.now();
    document.getElementById('editAutoName').value = '';
    document.getElementById('editAutoIcon').value = '🤖';
    document.getElementById('modalAutoIconBadge').innerText = '🤖';
    document.getElementById('modalAutoTitle').innerText = 'Criar Nova Automação';
    document.getElementById('editAutoEnabled').checked = true;
    document.getElementById('editAutoTriggerType').value = 'gate_prolonged';
    onAutoTriggerChange();
    editingAutoActions = [];
    if (btnDel) btnDel.style.display = 'none';
  }

  renderModalAutoActions();
  modal?.classList.add('active');
}

function closeEditAutomationModal() {
  document.getElementById('editAutomationModal')?.classList.remove('active');
}

function onAutoTriggerChange() {
  const trigger = document.getElementById('editAutoTriggerType')?.value;
  const nameEl = document.getElementById('editAutoName');
  const iconEl = document.getElementById('editAutoIcon');
  const descEl = document.getElementById('editAutoTriggerDesc');
  const condEl = document.getElementById('editAutoCondition');
  const actEl = document.getElementById('editAutoActionDesc');

  if (trigger === 'gate_prolonged') {
    if (!nameEl.value || nameEl.value.includes('Nova')) nameEl.value = 'Alerta de Portão Aberto (> 1 min)';
    iconEl.value = '🚨';
    descEl.value = 'Quando o portão da garagem permanecer aberto por mais de 60 segundos';
    condEl.value = 'Sensor de contato magnético do portão acusa estado aberto';
    actEl.value = 'Emitir alerta visual e sonoro no painel e registrar no Logbook';
  } else if (trigger === 'gate_opened') {
    if (!nameEl.value || nameEl.value.includes('Nova')) nameEl.value = 'Iluminação do Portão';
    iconEl.value = '🚪';
    descEl.value = 'Quando o portão for acionado entre 18:00 e 06:00';
    condEl.value = 'Horário Noturno (18h às 06h)';
    actEl.value = 'Acender Luz da Rua e Garagem para manobra segura';
  } else if (trigger === 'grid_fail') {
    if (!nameEl.value || nameEl.value.includes('Nova')) nameEl.value = 'Alerta de Queda de Rede CEEE';
    iconEl.value = '⚠️';
    descEl.value = 'Quando a tensão nas 3 fases cair abaixo de 50V';
    condEl.value = 'Interrupção total do fornecimento da concessionária';
    actEl.value = 'Emitir alerta crítico, notificar painel e registrar entrada do gerador';
  } else if (trigger === 'network_down') {
    if (!nameEl.value || nameEl.value.includes('Nova')) nameEl.value = 'Watchdog: Queda de Internet';
    iconEl.value = '🌐';
    descEl.value = 'Quando a central não conseguir conectar à internet WAN por mais de 30s';
    condEl.value = 'Conexão WAN desconectada ou link fibra rompido';
    actEl.value = 'Notificar central e manter operação estritamente em rede local';
  } else if (trigger === 'power_drop') {
    if (!nameEl.value || nameEl.value.includes('Nova')) nameEl.value = 'Wallbox BYD — Desarme Pós-Carga';
    iconEl.value = '⚡';
    descEl.value = 'Quando a potência do disjuntor BYD cair abaixo de 15W por 15min';
    condEl.value = 'Bateria do carro em 100% e carregamento concluído';
    actEl.value = 'Desarmar disjuntor DIN TOMPD-63SW para proteger a bateria';
  } else if (trigger === 'temperature_high') {
    if (!nameEl.value || nameEl.value.includes('Nova')) nameEl.value = 'Proteção Térmica do Barramento';
    iconEl.value = '🔥';
    descEl.value = 'Quando a temperatura do sensor NTC atingir mais de 65°C';
    condEl.value = 'Sobreaquecimento detectado no barramento do quadro';
    actEl.value = 'Emitir alarme de emergência elétrico e notificação no celular';
  }
  document.getElementById('modalAutoIconBadge').innerText = iconEl.value || '🤖';
}

function renderModalAutoActions() {
  const container = document.getElementById('autoActionsContainer');
  const countLabel = document.getElementById('autoActionCountLabel');
  if (countLabel) countLabel.innerText = editingAutoActions.length;
  if (!container) return;

  if (editingAutoActions.length === 0) {
    container.innerHTML = '<div style="color:var(--text-dim); font-size:11px; padding:8px; text-align:center;">Nenhuma ação direta em dispositivos atribuída. A automação executará alertas da central.</div>';
    return;
  }

  container.innerHTML = editingAutoActions.map((act, idx) => {
    const dev = devices.find(d => d.id === act.devId);
    const devName = act.name || dev?.name || act.devId;
    const isPulse = act.dps === 'pulse' || String(act.dps) === '1' && devName.toLowerCase().includes('portão');
    const isOn = act.value === true;
    const tagClass = isPulse ? 'tag-pulse' : (isOn ? 'tag-on' : 'tag-off');
    const tagText = isPulse ? '⚡ Pulso' : (isOn ? '🟢 Ligar' : '🔴 Desligar');
    const channelText = act.dps === 'all' ? 'Geral' : (act.dps === '16' ? 'Disjuntor' : `Canal ${act.dps}`);

    return `
      <div class="scene-action-row">
        <div class="scene-action-info">
          <span style="font-size:15px;">${getDeviceIcon(dev?.category)}</span>
          <div style="display:flex; flex-direction:column;">
            <span style="font-weight:600; color:var(--text-main);">${devName}</span>
            <span style="font-size:10px; color:var(--text-dim);">${dev?.room ? dev.room + ' • ' : ''}${channelText}</span>
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          <span class="scene-action-tag ${tagClass}">${tagText}</span>
          <button type="button" class="btn-icon-del" onclick="removeAutoActionRow(${idx})" title="Remover ação">✕</button>
        </div>
      </div>
    `;
  }).join('');
}

function addAutoActionRow() {
  const devSelect = document.getElementById('autoNewDevSelect');
  const chSelect = document.getElementById('autoNewChannelSelect');
  const valSelect = document.getElementById('autoNewValSelect');

  const devId = devSelect?.value;
  const dps = chSelect?.value || '1';
  const valRaw = valSelect?.value;

  if (!devId) {
    alert('Selecione um aparelho para adicionar');
    return;
  }

  const dev = devices.find(d => d.id === devId);
  const devName = dev?.name || devId;
  const isGate = dev?.category === 'ckmkzq' || devName.toLowerCase().includes('portão');

  let value = valRaw === 'true';
  let targetDps = dps;
  if (isGate || valRaw === 'pulse') {
    targetDps = '1';
    value = true;
  }

  editingAutoActions.push({
    devId,
    dps: targetDps,
    value,
    name: devName
  });

  renderModalAutoActions();
  showToast('Ação incluída', `${devName} adicionado à regra`, 'info');
}

function removeAutoActionRow(idx) {
  editingAutoActions.splice(idx, 1);
  renderModalAutoActions();
}

async function saveEditAutomation() {
  const autoId = document.getElementById('editAutoId')?.value.trim();
  const name = document.getElementById('editAutoName')?.value.trim();
  const icon = document.getElementById('editAutoIcon')?.value.trim() || '🤖';
  const enabled = document.getElementById('editAutoEnabled')?.checked;
  const triggerType = document.getElementById('editAutoTriggerType')?.value;
  const triggerDesc = document.getElementById('editAutoTriggerDesc')?.value.trim();
  const condition = document.getElementById('editAutoCondition')?.value.trim();
  const actionDesc = document.getElementById('editAutoActionDesc')?.value.trim();

  if (!name) {
    alert('Informe o nome da automação');
    return;
  }

  const autoPayload = {
    id: autoId || ('auto_' + Date.now()),
    name,
    icon,
    enabled: enabled !== false,
    triggerType,
    triggerDescription: triggerDesc || `Gatilho: ${triggerType}`,
    condition: condition || 'Sem restrições',
    actionDescription: actionDesc || 'Ação configurada',
    actions: editingAutoActions
  };

  try {
    const res = await fetch(`/api/automations/${autoPayload.id}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(autoPayload)
    });
    const data = await res.json();
    if (data.success) {
      currentAutomations = data.automations || currentAutomations;
      closeEditAutomationModal();
      renderAutomationsTab();
      showToast('Automação Salva', `Regra "${name}" atualizada com sucesso!`, 'success');
    } else {
      alert('Erro ao salvar automação: ' + (data.error || 'Erro desconhecido'));
    }
  } catch (err) {
    alert('Erro de conexão ao salvar automação: ' + err.message);
  }
}

async function deleteAutomation(autoId) {
  const auto = currentAutomations.find(a => a.id === autoId);
  const name = auto?.name || autoId;
  if (!confirm(`Tem certeza que deseja excluir a automação "${name}"?`)) return;

  try {
    let res = await fetch(`/api/automations/${autoId}`, { method: 'DELETE' });
    if (!res.ok) {
      res = await fetch(`/api/automations/${autoId}?_method=DELETE`, { method: 'POST' });
    }
    const data = await res.json();
    if (data.success) {
      currentAutomations = data.automations || currentAutomations.filter(a => a.id !== autoId);
      renderAutomationsTab();
      showToast('Automação Removida', `A automação "${name}" foi excluída.`, 'info');
    } else {
      alert('Erro ao excluir automação: ' + (data.error || 'Erro desconhecido'));
    }
  } catch (err) {
    try {
      const resPost = await fetch(`/api/automations/${autoId}?_method=DELETE`, { method: 'POST' });
      const dataPost = await resPost.json();
      if (dataPost.success) {
        currentAutomations = dataPost.automations || currentAutomations.filter(a => a.id !== autoId);
        renderAutomationsTab();
        showToast('Automação Removida', `A automação "${name}" foi excluída.`, 'info');
        return;
      }
    } catch (e) {}
    alert('Erro ao excluir automação: ' + err.message);
  }
}

async function deleteAutomationFromModal() {
  const autoId = document.getElementById('editAutoId')?.value;
  if (!autoId) return;
  await deleteAutomation(autoId);
  closeEditAutomationModal();
}

async function testAutomationFromModal() {
  const autoId = document.getElementById('editAutoId')?.value;
  if (autoId) {
    await executeAutomation(autoId);
  } else {
    showToast('Testando Automação', 'Executando ações atribuídas...', 'info');
    for (const act of editingAutoActions) {
      try {
        await fetch(`/api/device/${act.devId}/toggle`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dps: act.dps, value: act.value })
        });
      } catch (e) {}
    }
    fetchDevices();
    showToast('Teste Concluído', 'Ações da regra disparadas com sucesso!', 'success');
  }
}

// =============================================================
// GRÁFICO HISTÓRICO CONTÍNUO DE 24 HORAS (POWER & PHASE TRENDS)
// =============================================================
let currentTrendMetric = 'homeWatts';
let energyTrendsData = [];

async function fetchEnergyTrends() {
  try {
    const res = await fetch('/api/energy/trends');
    if (!res.ok) return;
    const data = await res.json();
    energyTrendsData = data.points || [];
    renderEnergyTrendsChart(currentTrendMetric);
  } catch (err) {
    console.error('[-] Erro ao carregar tendências:', err);
  }
}

function switchTrendMetric(metric) {
  currentTrendMetric = metric;
  document.querySelectorAll('#trendsMetricSelector button').forEach(b => b.classList.remove('active'));
  if (metric === 'homeWatts') document.getElementById('btnTrendHomeWatts')?.classList.add('active');
  if (metric === 'voltages') document.getElementById('btnTrendVoltages')?.classList.add('active');
  if (metric === 'boxTemp') document.getElementById('btnTrendBoxTemp')?.classList.add('active');
  if (metric === 'totalAmps') document.getElementById('btnTrendTotalAmps')?.classList.add('active');
  renderEnergyTrendsChart(metric);
}

function renderEnergyTrendsChart(metric) {
  const container = document.getElementById('trendSvgContainer');
  const summary = document.getElementById('trendStatsSummary');
  const legend = document.getElementById('trendLegend');
  if (!container || !energyTrendsData || energyTrendsData.length === 0) return;

  const points = energyTrendsData;
  const n = points.length;

  if (metric === 'homeWatts') {
    const vals = points.map(p => p.homeWatts);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const avg = Math.round(vals.reduce((a, b) => a + b, 0) / n);
    const latest = vals[n - 1];

    if (summary) {
      summary.innerHTML = `
        <div class="trend-stat-chip">
          <span class="trend-stat-label">Potência Atual</span>
          <span class="trend-stat-val" style="color:var(--accent-cyan);">${latest} W</span>
        </div>
        <div class="trend-stat-chip">
          <span class="trend-stat-label">Média 24 Horas</span>
          <span class="trend-stat-val">${avg} W</span>
        </div>
        <div class="trend-stat-chip">
          <span class="trend-stat-label">Mínima (Madrugada)</span>
          <span class="trend-stat-val text-emerald">${min} W</span>
        </div>
        <div class="trend-stat-chip">
          <span class="trend-stat-label">Pico Máximo</span>
          <span class="trend-stat-val" style="color:#f59e0b;">${max} W</span>
        </div>
      `;
    }

    const W = 800;
    const H = 200;
    const padX = 40;
    const padY = 20;
    const chartW = W - padX * 2;
    const chartH = H - padY * 2;

    const range = (max - min) || 1;
    const getY = (val) => H - padY - ((val - min) / range) * chartH;
    const getX = (idx) => padX + (idx / (n - 1)) * chartW;

    const pathCoords = points.map((p, i) => `${getX(i)},${getY(p.homeWatts)}`).join(' L ');
    const areaD = `M ${getX(0)},${getY(points[0].homeWatts)} L ${pathCoords} L ${getX(n - 1)},${H - padY} L ${getX(0)},${H - padY} Z`;
    const lineD = `M ${pathCoords}`;

    container.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <defs>
          <linearGradient id="areaGradWatts" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#38bdf8" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="#38bdf8" stop-opacity="0.0"/>
          </linearGradient>
        </defs>
        <line x1="${padX}" y1="${getY(min)}" x2="${W - padX}" y2="${getY(min)}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3,3"/>
        <line x1="${padX}" y1="${getY((min+max)/2)}" x2="${W - padX}" y2="${getY((min+max)/2)}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3,3"/>
        <line x1="${padX}" y1="${getY(max)}" x2="${W - padX}" y2="${getY(max)}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3,3"/>

        <path d="${areaD}" fill="url(#areaGradWatts)" />
        <path d="${lineD}" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
        <circle cx="${getX(n - 1)}" cy="${getY(latest)}" r="4.5" fill="#38bdf8" stroke="#ffffff" stroke-width="2" />

        ${points.filter((_, i) => i % 4 === 0 || i === n - 1).map(p => {
          const origIdx = points.indexOf(p);
          return `<text x="${getX(origIdx)}" y="${H - 4}" fill="#64748b" font-size="10" font-family="var(--font-mono)" text-anchor="middle">${p.time}</text>`;
        }).join('')}
      </svg>
    `;

    if (legend) {
      legend.innerHTML = `
        <div class="trend-legend-item">
          <span class="trend-legend-dot" style="background:#38bdf8;"></span>
          <span>Potência Ativa Residencial Total (Watts Kowsi)</span>
        </div>
      `;
    }
  } else if (metric === 'voltages') {
    const vA = points.map(p => p.voltageA);
    const vB = points.map(p => p.voltageB);
    const vC = points.map(p => p.voltageC);
    const allV = [...vA, ...vB, ...vC];
    const min = Math.floor(Math.min(...allV) - 1);
    const max = Math.ceil(Math.max(...allV) + 1);

    if (summary) {
      summary.innerHTML = `
        <div class="trend-stat-chip">
          <span class="trend-stat-label">Fase A Atual</span>
          <span class="trend-stat-val" style="color:#f59e0b;">${vA[n-1]} V</span>
        </div>
        <div class="trend-stat-chip">
          <span class="trend-stat-label">Fase B Atual</span>
          <span class="trend-stat-val" style="color:#38bdf8;">${vB[n-1]} V</span>
        </div>
        <div class="trend-stat-chip">
          <span class="trend-stat-label">Fase C Atual</span>
          <span class="trend-stat-val" style="color:#c084fc;">${vC[n-1]} V</span>
        </div>
        <div class="trend-stat-chip">
          <span class="trend-stat-label">Estabilidade de Rede</span>
          <span class="trend-stat-val text-emerald">100% Estável</span>
        </div>
      `;
    }

    const W = 800;
    const H = 200;
    const padX = 40;
    const padY = 20;
    const chartW = W - padX * 2;
    const chartH = H - padY * 2;
    const range = (max - min) || 1;
    const getY = (val) => H - padY - ((val - min) / range) * chartH;
    const getX = (idx) => padX + (idx / (n - 1)) * chartW;

    const pathA = points.map((p, i) => `${getX(i)},${getY(p.voltageA)}`).join(' L ');
    const pathB = points.map((p, i) => `${getX(i)},${getY(p.voltageB)}`).join(' L ');
    const pathC = points.map((p, i) => `${getX(i)},${getY(p.voltageC)}`).join(' L ');

    container.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <line x1="${padX}" y1="${getY(127)}" x2="${W - padX}" y2="${getY(127)}" stroke="rgba(255,255,255,0.08)" stroke-dasharray="4,4"/>
        <line x1="${padX}" y1="${getY(120)}" x2="${W - padX}" y2="${getY(120)}" stroke="rgba(255,255,255,0.04)" stroke-dasharray="2,2"/>

        <path d="M ${pathA}" fill="none" stroke="#f59e0b" stroke-width="2" stroke-linecap="round"/>
        <path d="M ${pathB}" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round"/>
        <path d="M ${pathC}" fill="none" stroke="#c084fc" stroke-width="2" stroke-linecap="round"/>

        ${points.filter((_, i) => i % 4 === 0 || i === n - 1).map(p => {
          const origIdx = points.indexOf(p);
          return `<text x="${getX(origIdx)}" y="${H - 4}" fill="#64748b" font-size="10" font-family="var(--font-mono)" text-anchor="middle">${p.time}</text>`;
        }).join('')}
      </svg>
    `;

    if (legend) {
      legend.innerHTML = `
        <div class="trend-legend-item"><span class="trend-legend-dot" style="background:#f59e0b;"></span><span>Fase A (${vA[n-1]}V)</span></div>
        <div class="trend-legend-item"><span class="trend-legend-dot" style="background:#38bdf8;"></span><span>Fase B (${vB[n-1]}V)</span></div>
        <div class="trend-legend-item"><span class="trend-legend-dot" style="background:#c084fc;"></span><span>Fase C (${vC[n-1]}V)</span></div>
      `;
    }
  } else if (metric === 'boxTemp') {
    const temps = points.map(p => p.boxTemp);
    const min = Math.min(...temps);
    const max = Math.max(...temps);
    const latest = temps[n - 1];

    if (summary) {
      summary.innerHTML = `
        <div class="trend-stat-chip">
          <span class="trend-stat-label">Temperatura NTC Atual</span>
          <span class="trend-stat-val text-emerald">${latest} °C</span>
        </div>
        <div class="trend-stat-chip">
          <span class="trend-stat-label">Mínima Registrada</span>
          <span class="trend-stat-val">${min} °C</span>
        </div>
        <div class="trend-stat-chip">
          <span class="trend-stat-label">Máxima Registrada</span>
          <span class="trend-stat-val">${max} °C</span>
        </div>
        <div class="trend-stat-chip">
          <span class="trend-stat-label">Limite Crítico</span>
          <span class="trend-stat-val" style="color:#f87171;">65 °C</span>
        </div>
      `;
    }

    const W = 800;
    const H = 200;
    const padX = 40;
    const padY = 20;
    const chartW = W - padX * 2;
    const chartH = H - padY * 2;
    const range = (max - min) || 5;
    const getY = (val) => H - padY - ((val - min) / range) * chartH;
    const getX = (idx) => padX + (idx / (n - 1)) * chartW;
    const pathCoords = points.map((p, i) => `${getX(i)},${getY(p.boxTemp)}`).join(' L ');

    container.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <path d="M ${pathCoords}" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round"/>
        <circle cx="${getX(n - 1)}" cy="${getY(latest)}" r="4.5" fill="#10b981" stroke="#ffffff" stroke-width="2"/>
        ${points.filter((_, i) => i % 4 === 0 || i === n - 1).map(p => {
          const origIdx = points.indexOf(p);
          return `<text x="${getX(origIdx)}" y="${H - 4}" fill="#64748b" font-size="10" font-family="var(--font-mono)" text-anchor="middle">${p.time}</text>`;
        }).join('')}
      </svg>
    `;

    if (legend) {
      legend.innerHTML = `
        <div class="trend-legend-item"><span class="trend-legend-dot" style="background:#10b981;"></span><span>Temperatura NTC do Barramento de Entrada (DPS 108)</span></div>
      `;
    }
  } else if (metric === 'totalAmps') {
    const amps = points.map(p => p.totalAmps);
    const min = Math.min(...amps);
    const max = Math.max(...amps);
    const latest = amps[n - 1];

    if (summary) {
      summary.innerHTML = `
        <div class="trend-stat-chip"><span class="trend-stat-label">Corrente Atual</span><span class="trend-stat-val text-cyan">${latest} A</span></div>
        <div class="trend-stat-chip"><span class="trend-stat-label">Corrente Mínima</span><span class="trend-stat-val">${min} A</span></div>
        <div class="trend-stat-chip"><span class="trend-stat-label">Corrente Máxima</span><span class="trend-stat-val">${max} A</span></div>
        <div class="trend-stat-chip"><span class="trend-stat-label">Disjuntor Geral</span><span class="trend-stat-val">63 A (Seguro)</span></div>
      `;
    }

    const W = 800;
    const H = 200;
    const padX = 40;
    const padY = 20;
    const chartW = W - padX * 2;
    const chartH = H - padY * 2;
    const range = (max - min) || 1;
    const getY = (val) => H - padY - ((val - min) / range) * chartH;
    const getX = (idx) => padX + (idx / (n - 1)) * chartW;
    const pathCoords = points.map((p, i) => `${getX(i)},${getY(p.totalAmps)}`).join(' L ');

    container.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
        <path d="M ${pathCoords}" fill="none" stroke="#38bdf8" stroke-width="2.5" stroke-linecap="round"/>
        <circle cx="${getX(n - 1)}" cy="${getY(latest)}" r="4" fill="#38bdf8" stroke="#ffffff" stroke-width="2"/>
        ${points.filter((_, i) => i % 4 === 0 || i === n - 1).map(p => {
          const origIdx = points.indexOf(p);
          return `<text x="${getX(origIdx)}" y="${H - 4}" fill="#64748b" font-size="10" font-family="var(--font-mono)" text-anchor="middle">${p.time}</text>`;
        }).join('')}
      </svg>
    `;

    if (legend) {
      legend.innerHTML = `
        <div class="trend-legend-item"><span class="trend-legend-dot" style="background:#38bdf8;"></span><span>Corrente Total Trifásica (Amperes)</span></div>
      `;
    }
  }
}

// =============================================================
// BACKUP COMPLETO & RESTAURAÇÃO EM 1 CLIQUE
// =============================================================
function openBackupModal() {
  document.getElementById('backupModal')?.classList.add('active');
}
function closeBackupModal() {
  document.getElementById('backupModal')?.classList.remove('active');
}

function downloadBackupSnapshot() {
  const url = `${BACKEND_API_BASE}/api/system/backup`;
  window.open(url, '_blank');
  showToast('💾 Download do Snapshot de Backup iniciado!', 'success');
}

function handleBackupFileSelected(input) {
  const file = input.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    try {
      const json = JSON.parse(e.target.result);
      const res = await fetch('/api/system/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(json)
      });
      const data = await res.json();
      if (data.success) {
        showToast('✅ Snapshot restaurado com sucesso na central!', 'success');
        const st = document.getElementById('restoreStatusMsg');
        if (st) {
          st.innerText = '✅ Backup restaurado com sucesso! Atualizando dados...';
          st.style.display = 'block';
        }
        fetchDevices();
        fetchEnergy();
        fetchAutomations();
        fetchLogs();
        setTimeout(closeBackupModal, 1500);
      } else {
        alert('Erro ao restaurar: ' + data.error);
      }
    } catch (err) {
      alert('Arquivo inválido ou corrompido: ' + err.message);
    }
  };
  reader.readAsText(file);
}

// =============================================================
// COMANDOS DE VOZ & WEBHOOK (GOOGLE HOME / ALEXA / SIRI)
// =============================================================
function openVoiceWebhookModal() {
  document.getElementById('voiceWebhookModal')?.classList.add('active');
}
function closeVoiceWebhookModal() {
  document.getElementById('voiceWebhookModal')?.classList.remove('active');
}

async function testVoiceAction(action) {
  const badge = document.getElementById('voiceStatusBadge');
  const speechOutput = document.getElementById('voiceSpeechOutput');
  const jsonPre = document.getElementById('voiceJsonOutput');

  if (badge) {
    badge.innerText = 'Processando...';
    badge.className = 'badge badge-live';
  }

  try {
    const res = await fetch(`/api/webhook/voice?action=${action}`);
    const data = await res.json();

    if (badge) {
      badge.innerText = data.success ? '✓ Concluído' : '✗ Erro';
      badge.className = `badge ${data.success ? 'badge-emerald' : 'badge-neutral'}`;
    }

    if (speechOutput) {
      speechOutput.innerText = data.speech || data.fulfillmentText || 'Comando executado.';
    }

    if (jsonPre) {
      jsonPre.style.display = 'block';
      jsonPre.innerText = JSON.stringify(data, null, 2);
    }

    // Síntese de Voz Nativa no Navegador
    if ('speechSynthesis' in window && data.speech) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(data.speech);
      utterance.lang = 'pt-BR';
      utterance.rate = 1.05;
      window.speechSynthesis.speak(utterance);
    }

    showToast(`🎙️ Voz: ${data.speech}`, 'info');
  } catch (err) {
    if (speechOutput) speechOutput.innerText = `Erro de comunicação: ${err.message}`;
    if (badge) badge.innerText = 'Falha';
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copiado para a área de transferência!', 'success');
  }).catch(() => {
    alert(text);
  });
}

// Sincronização Dinâmica do Badge de Versão
async function syncVersionBadge() {
  const vBadge = document.getElementById('headerVersionBadge');
  try {
    const res = await fetch('/version.json?t=' + Date.now(), { cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data && data.version && vBadge) {
        vBadge.innerText = data.version;
      }
    }
  } catch (e) {}
}
syncVersionBadge();

// =============================================================
// CENTRAL DE VEÍCULOS ELÉTRICOS (GWM ORA 5 & BYD DOLPHIN MINI)
// =============================================================
let currentEvVehicle = 'ora5';
let evVehiclesData = null;

async function fetchEvData() {
  try {
    const res = await fetch('/api/ev/status', { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    if (data.success && data.vehicles) {
      evVehiclesData = data.vehicles;
      renderEvDashboard();
      updateEvOverviewCard();
    }
  } catch (err) {
    console.warn('[EV Data Fetch Warning]:', err.message);
    for (const prefix of ['evQuickOra', 'evQuickByd']) {
      const source = document.getElementById(prefix + 'Source');
      if (source) source.innerText = 'Sem dados: integração ainda não instalada no NAS';
      const lock = document.getElementById(prefix + 'Lock');
      if (lock) lock.innerText = 'Indisponível';
    }
  }
}

function updateEvOverviewCard() {
  if (!evVehiclesData) return;
  const ora = evVehiclesData.ora5;
  const byd = evVehiclesData.dolphin_mini;

  // One card per vehicle; the source line says when values are simulated or cached instead of live.
  const fill = (prefix, veh) => {
    if (!veh) return;
    const set = (id, text) => { const el = document.getElementById(prefix + id); if (el) el.innerText = text; };
    set('Soc', `${veh.batterySoc}%`);
    set('Range', `${veh.evRangeKm} km de autonomia`);
    set('Lock', veh.doorsLocked ? '🔒 Trancado' : '🔓 Aberto');
    const source = String(veh.source || '');
    const synced = veh.lastSync ? new Date(veh.lastSync).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
    set('Source', /simulad/i.test(source) ? '⚠️ Simulados (integração pendente)' : /oficial/i.test(source) ? `Nuvem oficial · ${synced}` : `Último dado salvo · ${synced}`);
    const bar = document.getElementById(prefix + 'Bar');
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, Number(veh.batterySoc) || 0))}%`;
  };
  fill('evQuickOra', ora);
  fill('evQuickByd', byd);
}

function selectEvVehicle(vehId) {
  currentEvVehicle = vehId;
  const btnOra = document.getElementById('evBtnOra5');
  const btnDolphin = document.getElementById('evBtnDolphin');

  if (vehId === 'ora5') {
    if (btnOra) btnOra.classList.add('active');
    if (btnDolphin) btnDolphin.classList.remove('active');
  } else {
    if (btnOra) btnOra.classList.remove('active');
    if (btnDolphin) btnDolphin.classList.add('active');
  }

  renderEvDashboard();
}

function renderEvDashboard() {
  if (!evVehiclesData) return;
  const veh = evVehiclesData[currentEvVehicle];
  if (!veh) return;

  // Header Hero
  const brandEl = document.getElementById('evHeroBrand');
  const modelEl = document.getElementById('evHeroModel');
  const plateEl = document.getElementById('evHeroPlate');
  const lockBadge = document.getElementById('evHeroLockBadge');
  const chargeBadge = document.getElementById('evHeroChargingBadge');
  const onlineBadge = document.getElementById('evHeroOnlineBadge');

  if (brandEl) brandEl.innerText = `${veh.brand.toUpperCase()} • ${veh.powerType.toUpperCase()}`;
  if (modelEl) modelEl.innerText = veh.model;
  if (plateEl) plateEl.innerText = `Placa: ${veh.plate} • Cor: ${veh.color}`;

  if (lockBadge) {
    lockBadge.className = `badge ${veh.doorsLocked ? 'badge-emerald' : 'badge-danger'}`;
    lockBadge.innerText = veh.doorsLocked ? '🔒 Trancado' : '🔓 Destrancado';
  }

  if (chargeBadge) {
    const isCharging = veh.chargingState === 'charging';
    chargeBadge.className = `badge ${isCharging ? 'badge-live' : ''}`;
    chargeBadge.innerText = isCharging ? '⚡ Carregando' : (veh.plugConnected ? '🔌 Plugado' : '⚡ Desconectado');
  }

  // Bateria & Autonomia
  const socEl = document.getElementById('evBatterySoc');
  const rangeEl = document.getElementById('evRangeKm');
  const barEl = document.getElementById('evBatteryBar');
  const capEl = document.getElementById('evBatteryCap');
  const maxRangeEl = document.getElementById('evMaxRange');
  const plugEl = document.getElementById('evPlugStatus');
  const pwrEl = document.getElementById('evChargePower');
  const b12vEl = document.getElementById('ev12vSoc');

  if (socEl) socEl.innerText = `${veh.batterySoc}%`;
  if (rangeEl) rangeEl.innerHTML = `${veh.evRangeKm} <small>km</small>`;
  if (barEl) barEl.style.width = `${Math.min(100, Math.max(0, veh.batterySoc))}%`;
  if (capEl) capEl.innerText = `${veh.batteryCapacityKwh.toFixed(1)} kWh`;
  if (maxRangeEl) maxRangeEl.innerText = `${veh.maxRangeKm} km`;
  if (plugEl) plugEl.innerText = veh.plugConnected ? '🔌 Conectado' : '🔌 Desconectado';
  if (pwrEl) pwrEl.innerText = `${veh.chargingPowerKw || 0.0} kW`;
  if (b12vEl) b12vEl.innerText = `${veh.aux12vBatterySoc}% (Excelente)`;

  // TPMS
  if (veh.tires) {
    const flPsi = document.getElementById('tpmsFlPsi');
    const flTemp = document.getElementById('tpmsFlTemp');
    const frPsi = document.getElementById('tpmsFrPsi');
    const frTemp = document.getElementById('tpmsFrTemp');
    const rlPsi = document.getElementById('tpmsRlPsi');
    const rlTemp = document.getElementById('tpmsRlTemp');
    const rrPsi = document.getElementById('tpmsRrPsi');
    const rrTemp = document.getElementById('tpmsRrTemp');

    if (flPsi) flPsi.innerText = `${veh.tires.fl.psi} PSI`;
    if (flTemp) flTemp.innerText = `${veh.tires.fl.tempC}°C`;
    if (frPsi) frPsi.innerText = `${veh.tires.fr.psi} PSI`;
    if (frTemp) frTemp.innerText = `${veh.tires.fr.tempC}°C`;
    if (rlPsi) rlPsi.innerText = `${veh.tires.rl.psi} PSI`;
    if (rlTemp) rlTemp.innerText = `${veh.tires.rl.tempC}°C`;
    if (rrPsi) rrPsi.innerText = `${veh.tires.rr.psi} PSI`;
    if (rrTemp) rrTemp.innerText = `${veh.tires.rr.tempC}°C`;
  }

  // Portas & Travas
  const lockText = document.getElementById('evLockStateText');
  if (lockText) lockText.innerText = veh.doorsLocked ? '🔒 Veículo Trancado' : '🔓 Veículo Destrancado';

  const dFL = document.getElementById('doorValFL');
  const dFR = document.getElementById('doorValFR');
  const dRL = document.getElementById('doorValRL');
  const dRR = document.getElementById('doorValRR');
  const dTrunk = document.getElementById('doorValTrunk');
  const dHood = document.getElementById('doorValHood');
  const dWin = document.getElementById('doorValWindows');
  const dRoof = document.getElementById('doorValSunroof');

  if (dFL) dFL.innerText = veh.doors.fl ? 'Aberta ⚠️' : 'Fechada';
  if (dFR) dFR.innerText = veh.doors.fr ? 'Aberta ⚠️' : 'Fechada';
  if (dRL) dRL.innerText = veh.doors.rl ? 'Aberta ⚠️' : 'Fechada';
  if (dRR) dRR.innerText = veh.doors.rr ? 'Aberta ⚠️' : 'Fechada';
  if (dTrunk) dTrunk.innerText = veh.doors.trunk ? 'Aberto ⚠️' : 'Fechado';
  if (dHood) dHood.innerText = veh.doors.hood ? 'Aberto ⚠️' : 'Fechado';
  if (dWin) dWin.innerText = 'Todos Fechados';
  if (dRoof) dRoof.innerText = (veh.windows.sunroof === 'panoramic' || veh.windows.sunroof === 'panoramic_fixed') ? 'Panorâmico' : (veh.windows.sunroof === 'closed' ? 'Fechado' : 'Aberto');

  // Climatização
  const cabinTempEl = document.getElementById('evCabinTemp');
  const targetTempEl = document.getElementById('evTargetTemp');
  const btnAc = document.getElementById('btnToggleAc');

  if (cabinTempEl && veh.climate) cabinTempEl.innerText = `${veh.climate.cabinTempC || 23.5}°C`;
  if (targetTempEl && veh.climate) targetTempEl.innerText = `${(veh.climate.targetTempC || 22.0).toFixed(1)}°C`;
  if (btnAc && veh.climate) {
    btnAc.innerText = veh.climate.active ? '❄️ Desligar Climatização' : '❄️ Ligar Climatização (15 Minutos)';
  }

  // Localização & Hodômetro
  const addrEl = document.getElementById('evLocationAddr');
  const odomEl = document.getElementById('evOdometer');
  const srcEl = document.getElementById('evDataSource');

  if (addrEl && veh.location) addrEl.innerText = veh.location.address || 'Garagem Residencial';
  if (odomEl) odomEl.innerText = `${(veh.odometerKm || 0).toLocaleString('pt-BR')} km`;
  if (srcEl) srcEl.innerText = veh.source || 'Nuvem Oficial mTLS';

  // Ficha Técnica Oficial de Engenharia
  const specsTitleEl = document.getElementById('evSpecsTitle');
  const specsGridEl = document.getElementById('evSpecsGrid');
  if (specsTitleEl) {
    specsTitleEl.innerText = `FICHA TÉCNICA OFICIAL & ENGENHARIA — ${veh.model.toUpperCase()}`;
  }
  if (specsGridEl) {
    const isOra = currentEvVehicle === 'ora5';
    const specsItems = isOra ? [
      { lbl: 'Motorização', val: 'Elétrico FWD (204 cv • 260 Nm)' },
      { lbl: 'Aceleração 0 a 100 km/h', val: '7,7 segundos' },
      { lbl: 'Velocidade Máxima', val: '170 km/h' },
      { lbl: 'Bateria de Tração', val: '58,3 kWh LFP (Lítio-Ferro-Fosfato)' },
      { lbl: 'Autonomia Inmetro', val: '349 km (435 km ciclo WLTP)' },
      { lbl: 'Recarga Rápida DC', val: 'Até 120 kW (30% a 80% em 20 min)' },
      { lbl: 'Recarga AC', val: '11 kW trifásica (~8h30)' },
      { lbl: 'Conector de Recarga', val: 'CCS2 / Tipo 2' },
      { lbl: 'Dimensões (CxLxA)', val: '4.471 x 1.833 x 1.641 mm' },
      { lbl: 'Entre-eixos / Vão Livre', val: '2.720 mm • 175 mm' },
      { lbl: 'Porta-malas / Peso', val: '362 L • 1.685 kg' },
      { lbl: 'Rodas & Pneus', val: '225/60 R18 (Liga Leve 18")' },
      { lbl: 'Teto', val: 'Solar Panorâmico' },
      { lbl: 'Assistência Condução', val: 'ADAS 2+ & Câmera 540°' },
      { lbl: 'Multimídia & Painel', val: 'Tela 14,6" + Painel 10,25"' },
      { lbl: 'Modos de Condução', val: 'Eco, Normal, Esportivo, Well Being' },
    ] : [
      { lbl: 'Motorização', val: 'Elétrico FWD (75 cv • 135 Nm)' },
      { lbl: 'Aceleração 0 a 100 km/h', val: '14,9 segundos' },
      { lbl: 'Velocidade Máxima', val: '130 km/h' },
      { lbl: 'Bateria de Tração', val: '38,0 kWh Blade Battery (LFP)' },
      { lbl: 'Autonomia Inmetro', val: '280 km' },
      { lbl: 'Recarga Rápida DC', val: 'Até 40 kW (30% a 80% em 30 min)' },
      { lbl: 'Recarga AC', val: '6,6 kW monofásica (~6h)' },
      { lbl: 'Conector de Recarga', val: 'CCS2 / Tipo 2' },
      { lbl: 'Dimensões (CxLxA)', val: '3.780 x 1.715 x 1.580 mm' },
      { lbl: 'Entre-eixos / Vão Livre', val: '2.500 mm • 120 mm' },
      { lbl: 'Porta-malas / Peso', val: '230 L • 1.058 kg' },
      { lbl: 'Rodas & Pneus', val: '175/55 R16 (Liga Leve 16")' },
      { lbl: 'Teto', val: 'Rígido Convencional' },
      { lbl: 'Assistência Condução', val: 'Controle de Cruzeiro & Câmera Ré' },
      { lbl: 'Multimídia & Painel', val: 'Tela Rotativa 10,1" + Painel 7"' },
      { lbl: 'Modos de Condução', val: 'Eco, Normal, Sport' },
    ];

    specsGridEl.innerHTML = specsItems.map(item => `
      <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:10px; padding:10px 14px;">
        <div style="font-size:11px; text-transform:uppercase; color:var(--text-muted); letter-spacing:0.5px;">${item.lbl}</div>
        <div style="font-size:13px; font-weight:600; color:#fff; margin-top:3px;">${item.val}</div>
      </div>
    `).join('');
  }
}

function adjustEvTemp(delta) {
  if (!evVehiclesData) return;
  const veh = evVehiclesData[currentEvVehicle];
  if (!veh || !veh.climate) return;
  let t = (veh.climate.targetTempC || 22.0) + delta;
  t = Math.max(16, Math.min(30, t));
  veh.climate.targetTempC = t;
  const targetTempEl = document.getElementById('evTargetTemp');
  if (targetTempEl) targetTempEl.innerText = `${t.toFixed(1)}°C`;
}

async function triggerEvAction(action) {
  const vName = currentEvVehicle === 'dolphin_mini' ? 'BYD Dolphin Mini' : 'GWM Ora 5';
  showToast(`Enviando comando "${action}" para ${vName}... 🚗`);

  try {
    const res = await fetch('/api/ev/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vehicle: currentEvVehicle,
        command: action
      })
    });
    const data = await res.json();
    if (data.success) {
      showToast(data.message || 'Comando executado com sucesso!', 'success');
      // Atualização otimista
      if (action === 'lock' && evVehiclesData[currentEvVehicle]) {
        evVehiclesData[currentEvVehicle].doorsLocked = true;
      } else if (action === 'unlock' && evVehiclesData[currentEvVehicle]) {
        evVehiclesData[currentEvVehicle].doorsLocked = false;
      } else if (action === 'toggle_ac' && evVehiclesData[currentEvVehicle]) {
        evVehiclesData[currentEvVehicle].climate.active = !evVehiclesData[currentEvVehicle].climate.active;
      }
      renderEvDashboard();
      updateEvOverviewCard();
    } else {
      showToast(`Erro no comando: ${data.error}`, 'danger');
    }
  } catch (err) {
    showToast(`Falha de comunicação: ${err.message}`, 'danger');
  }
}

async function syncEvData() {
  const btn = document.getElementById('btnSyncEv');
  if (btn) btn.innerText = '🔄 Sincronizando...';
  showToast('Sincronizando telemetria com as nuvens GWM & BYD...');

  try {
    await fetch('/api/ev/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ vehicle: currentEvVehicle })
    });
    await fetchEvData();
    showToast('Telemetria atualizada com sucesso! ⚡', 'success');
  } catch (err) {
    showToast(`Erro ao sincronizar: ${err.message}`, 'warning');
  } finally {
    if (btn) btn.innerText = '🔄 Sincronizar Nuvem';
  }
}

function openEvMap() {
  if (!evVehiclesData) return;
  const veh = evVehiclesData[currentEvVehicle];
  if (veh && veh.location && veh.location.lat) {
    const url = `https://www.google.com/maps?q=${veh.location.lat},${veh.location.lon}`;
    window.open(url, '_blank');
  }
}

// Inicializa busca de EV em background na carga da página
setTimeout(fetchEvData, 1500);
setInterval(fetchEvData, 45000);





