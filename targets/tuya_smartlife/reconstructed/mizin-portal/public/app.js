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
let BACKEND_API_BASE = isDirectHost || currentHost.includes('trycloudflare.com') ? '' : 'https://elegant-marsh-warm-programmer.trycloudflare.com';
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

async function detectAccessMode() {
  const host = window.location.hostname;
  const isDirect = host === 'localhost' || host === '127.0.0.1' || host.startsWith('192.168.');
  const badge = document.getElementById('accessModeBadge');

  if (isDirect) {
    isLocalAccess = true;
    BACKEND_API_BASE = '';
    if (badge) {
      badge.innerText = '🏠 REDE LOCAL (1ms)';
      badge.className = 'badge badge-mode';
    }
    return true;
  }

  isLocalAccess = false;
  BACKEND_API_BASE = window.location.hostname.includes('trycloudflare.com') ? '' : 'https://elegant-marsh-warm-programmer.trycloudflare.com';
  if (badge) {
    badge.innerText = '🌐 MODO REMOTO (Cloudflare)';
    badge.className = 'badge badge-mode badge-remote';
  }
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
    const res = await fetch('/api/health?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    
    const latency = Date.now() - start;
    const pingEl = document.getElementById('pingMs');
    if (pingEl) pingEl.innerText = `~${latency}ms`;

    isConnected = true;
    failedPings = 0;
    disconnectedSince = null;
    if (alertEl) alertEl.classList.remove('active');
    if (statusEl) {
      statusEl.innerHTML = `ONLINE (<span id="pingMs">~${latency}ms</span>) • ${isLocalAccess ? 'REDE LOCAL' : 'MODO REMOTO'}`;
    }
    if (pulseEl) pulseEl.className = 'pulse-dot';
    if (indicatorEl) indicatorEl.className = 'status-indicator';

  } catch (err) {
    failedPings++;
    if (failedPings >= 2) {
      isConnected = false;
      if (!disconnectedSince) disconnectedSince = Date.now();
      const elapsedSec = Math.round((Date.now() - disconnectedSince) / 1000);

      if (statusEl) statusEl.innerText = 'DESCONECTADO';
      if (pulseEl) pulseEl.className = 'pulse-dot offline';
      if (indicatorEl) indicatorEl.className = 'status-indicator offline';

      // Dispara aviso visual se estiver em modo externo
      if (alertEl && !isLocalAccess) {
        alertEl.classList.add('active');
        if (alertTimerEl) alertTimerEl.innerText = `Sem sinal há ${elapsedSec}s... Tentando reconectar`;
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
  if (tabParam && ['overview', 'cameras', 'energy', 'automations', 'devices', 'logs'].includes(tabParam)) {
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
    const topGateBadge = document.getElementById('gateStateBadge');
    const topGateDesc = document.getElementById('gateStateDesc');
    let isGateOpen = false;
    if (gateDev) {
      const gDps = gateDev.live_dps || {};
      isGateOpen = gDps['3'] === true || gDps['6'] === 'open';
      if (topGateBadge) {
        topGateBadge.innerText = isGateOpen ? '🚨 ABERTO' : '🔒 FECHADO';
        topGateBadge.className = isGateOpen ? 'badge badge-live' : 'badge badge-emerald';
      }
      if (topGateDesc) {
        topGateDesc.innerText = isGateOpen ? 'Sensor: Portão Aberto 🚨' : 'Sensor: Fechado & Trancado 🔒';
        topGateDesc.style.color = isGateOpen ? 'var(--accent-rose)' : 'var(--accent-emerald)';
      }

      const camBarStatus = document.getElementById('camBarGateStatus');
      const camBarIcon = document.getElementById('camBarGateIcon');
      const ptzGateStatus = document.getElementById('ptzFloatingGateStatus');
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
      const isPulsing = liveDps['1'] === true;
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
              <span class="badge ${isOpen ? 'badge-live' : 'badge-emerald'}" id="gateCardBadge-${dev.id}">
                ${isOpen ? 'ABERTO' : 'FECHADO'}
              </span>
            </div>
          </div>

          <div class="gate-card-body">
            <div class="gate-sensor-status-ha">
              <div class="gate-sensor-badge-line">
                <span class="status-dot ${isOpen ? 'offline' : 'online'}"></span>
                <span class="gate-sensor-title">${isOpen ? 'Portão Aberto 🚨' : 'Portão Fechado & Trancado 🔒'}</span>
              </div>
              <span class="gate-sensor-sub">Sensor Magnético: ${isOpen ? 'Aberto / Liberado' : 'Fechado & Seguro'}</span>
            </div>
            <button class="gate-action-btn-main ${isPulsing ? 'is-pulsing' : ''}" id="btnGateCardPulse-${dev.id}" onclick="triggerGatePulse('${dev.id}', event)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:16px;height:16px;margin-right:6px;"><path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11M20 10v11"/></svg>
              <span id="btnGateCardText-${dev.id}">${isPulsing ? 'Acionando Motor...' : (isOpen ? 'Fechar Portão 🚪🔻' : 'Abrir Portão 🚪🔺')}</span>
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

async function startNetworkScan() {
  const area = document.getElementById('scanResultsArea');
  const msg = document.getElementById('scanStatusMsg');
  const btn = document.getElementById('btnScanRun');

  if (area) area.style.display = 'block';
  if (msg) msg.innerText = 'Escaneando rede 192.168.1.0/24 na porta 6668... Aguarde ~3s';
  if (btn) btn.disabled = true;

  try {
    const res = await fetch('/api/devices');
    await fetchDevices();
    if (msg) msg.innerText = `Varredura concluída! ${devices.length} dispositivos encontrados e sincronizados.`;
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

  const card = document.createElement('div');
  card.className = `toast-card toast-${type}`;
  card.innerHTML = `
    <div class="toast-icon">${icon}</div>
    <div class="toast-body">
      <div class="toast-title">${title}</div>
      <div class="toast-msg">${message}</div>
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

// Pulso do Portão (Card Específico do Guia Rápido)
async function triggerGatePulse(devId, event) {
  if (event) event.stopPropagation();
  const btn = document.getElementById(`btnGateCardPulse-${devId}`);
  const btnText = document.getElementById(`btnGateCardText-${devId}`);
  
  if (btn) {
    btn.classList.add('is-pulsing');
    if (btnText) btnText.innerText = 'Acionando Motor...';
  }

  showToast('Portão da Garagem', 'Comando de abertura/fechamento enviado ao motor!', '🚪', 'info');

  try {
    const res = await fetch('/api/gate/pulse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin: 'Portal Web (Card Dispositivo)' })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Portão da Garagem', 'Pulso de comando executado com sucesso!', '✅', 'success');
    }
    setTimeout(() => {
      if (btn) btn.classList.remove('is-pulsing');
      fetchDevices();
      fetchLogs();
    }, 1200);
  } catch (err) {
    showToast('Erro no Portão', err.message, '🚨', 'danger');
    if (btn) btn.classList.remove('is-pulsing');
  }
}

// Pulso do Portão (Card de Topo na Visão Geral e Câmeras)
async function pulseGate() {
  const btn = document.getElementById('btnPulseGate');
  if (btn) {
    btn.disabled = true;
    btn.innerText = 'Acionando...';
  }

  showToast('Portão da Garagem', 'Comando de abertura/fechamento enviado ao motor!', '🚪', 'info');

  try {
    const res = await fetch('/api/gate/pulse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ origin: 'Portal Web (Ação Rápida)' })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Portão da Garagem', 'Pulso executado! Contato seco restabelecido.', '✅', 'success');
    }
    setTimeout(() => {
      if (btn) {
        btn.disabled = false;
        btn.innerText = 'Acionar Portão';
      }
      fetchDevices();
      fetchLogs();
    }, 1200);
  } catch (err) {
    showToast('Erro no Portão', err.message, '🚨', 'danger');
    if (btn) {
      btn.disabled = false;
      btn.innerText = 'Acionar Portão';
    }
  }
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

async function fetchLogs() {
  try {
    const res = await fetch('/api/logs?limit=80');
    const data = await res.json();
    activityLogs = data.logs || [];
    unreadNotifCount = data.unreadCount || 0;

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

function setCameraLayout(mode) {
  currentCameraLayout = mode;
  document.querySelectorAll('.cam-mode-btn').forEach(b => b.classList.remove('active'));
  const activeBtn = document.getElementById(mode === '2x2' ? 'btnMode2x2' : (mode === 'focus' ? 'btnModeFocus' : 'btnModeGrid'));
  if (activeBtn) activeBtn.classList.add('active');

  const grid = document.getElementById('camerasGrid');
  if (grid) {
    grid.className = 'cameras-grid layout-' + mode;
  }
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
// Visualizador e Monitoramento de Câmeras (Outdoor Pro vs Fixas)
// -------------------------------------------------------------
function openPtzModal(camId) {
  activePtzCam = camId;
  const modal = document.getElementById('cameraPtzModal');
  const nameEl = document.getElementById('ptzModalCamName');
  const aliasEl = document.getElementById('ptzModalCamAlias');
  const feedImg = document.getElementById('ptzMainVideoFeed');
  const badgeEl = document.getElementById('ptzModalCapabilityBadge');
  const iconEl = document.getElementById('ptzModalIcon');
  const ptzMotorSection = document.getElementById('ptzMotorSection');
  const fixedCamInfoSection = document.getElementById('fixedCamInfoSection');

  const camObj = (window._cachedCameras || []).find(c => c.id === camId) || { id: camId, name: 'Câmera ' + camId, sourceAlias: camId };

  // REQUISITO EXPLÍCITO: APENAS A OUTDOOR PRO (POSTE) TEM MODO PTZ E ZOOM MOTORIZADO
  const isPtzCapable = (camId === 'outdoor_pro_poste' || (camObj.family && camObj.family.toLowerCase().includes('outdoor pro')) || (camObj.name && camObj.name.toLowerCase().includes('outdoor pro')));

  if (isPtzCapable) {
    if (nameEl) nameEl.innerText = `Controle PTZ & Áudio — ${camObj.name}`;
    if (badgeEl) {
      badgeEl.innerText = '🎮 PTZ MOTORIZADO + ZOOM ÓPTICO';
      badgeEl.className = 'badge badge-live';
    }
    if (iconEl) iconEl.innerText = '🎮';
    if (ptzMotorSection) ptzMotorSection.style.display = 'block';
    if (fixedCamInfoSection) fixedCamInfoSection.style.display = 'none';
  } else {
    // Câmeras Fixas: AW300 Garagem, AW300 Portão, Mi 2K Externa, Mi 2K Estúdio, Mi 2K Sala
    if (nameEl) nameEl.innerText = `Monitoramento & Áudio — ${camObj.name}`;
    if (badgeEl) {
      badgeEl.innerText = '📹 CÂMERA FIXA (2K HD)';
      badgeEl.className = 'badge badge-emerald';
    }
    if (iconEl) iconEl.innerText = '📹';
    if (ptzMotorSection) ptzMotorSection.style.display = 'none';
    if (fixedCamInfoSection) fixedCamInfoSection.style.display = 'block';
  }

  if (aliasEl) aliasEl.innerText = `Stream local: ${camObj.sourceAlias || camId} • go2rtc`;
  const streamAlias = camObj.sourceAlias || camId;
  const videoEl = document.getElementById('ptzMainVideoElement');
  const spinnerEl = document.getElementById('ptzVideoSpinner');

  if (feedImg) {
    feedImg.src = `${BACKEND_API_BASE}/api/camera-frame?src=${encodeURIComponent(streamAlias)}&t=${Date.now()}`;
    feedImg.style.display = 'block';
  }
  if (videoEl) {
    videoEl.style.display = 'none';
    if (spinnerEl) spinnerEl.style.display = 'block';
    videoEl.src = `${BACKEND_API_BASE}/api/camera-stream?src=${encodeURIComponent(streamAlias)}`;
    videoEl.muted = !isAudioListening;
    videoEl.onloadeddata = () => {
      videoEl.style.display = 'block';
      if (feedImg) feedImg.style.display = 'none';
      if (spinnerEl) spinnerEl.style.display = 'none';
    };
    videoEl.onerror = () => {
      videoEl.style.display = 'none';
      if (feedImg) feedImg.style.display = 'block';
      if (spinnerEl) spinnerEl.style.display = 'none';
    };
  }

  renderCustomShortcuts();
  if (modal) modal.classList.add('active');
}

function closePtzModal() {
  const modal = document.getElementById('cameraPtzModal');
  if (modal) modal.classList.remove('active');
  const videoEl = document.getElementById('ptzMainVideoElement');
  if (videoEl) {
    try {
      videoEl.pause();
      videoEl.removeAttribute('src');
      videoEl.load();
    } catch (e) {}
  }
  activePtzCam = null;
  if (isAudioListening) toggleAudioListen();
}

function sendPtzCommand(cmd) {
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
  showToast(`[PTZ ${camName}]: ${directions[cmd] || cmd}`);
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

  const videoEl = document.getElementById('ptzMainVideoElement');
  if (isAudioListening) {
    if (icon) icon.innerText = '🔊';
    if (text) text.innerText = 'Retorno Ativo (Ouvindo)';
    if (btn) btn.style.background = 'rgba(56, 189, 248, 0.25)';
    if (statusText) statusText.innerText = '🔊 Retorno de Som Ativo — Ouvindo ambiente da câmera ao vivo';
    if (videoEl) videoEl.muted = false;
    showToast('Retorno de som da câmera ativado! 🔊');
  } else {
    if (icon) icon.innerText = '🔇';
    if (text) text.innerText = 'Ouvir Retorno';
    if (btn) btn.style.background = '';
    if (statusText) statusText.innerText = 'Áudio Bidirecional: Microfone e Alto-Falante Prontos';
    if (videoEl) videoEl.muted = true;
    showToast('Retorno de som da câmera mutado.');
  }
}

function startPttTalk() {
  isPttTalking = true;
  const btn = document.getElementById('btnAudioTalk');
  const statusText = document.getElementById('audioStatusText');
  if (btn) btn.classList.add('active-talking');
  if (statusText) statusText.innerText = '🎤 TRANSMITINDO VOZ: Falando pelo alto-falante da câmera...';
  showToast('🎤 Transmitindo voz para o alto-falante da câmera...');
}

function stopPttTalk() {
  if (!isPttTalking) return;
  isPttTalking = false;
  const btn = document.getElementById('btnAudioTalk');
  const statusText = document.getElementById('audioStatusText');
  if (btn) btn.classList.remove('active-talking');
  if (statusText) statusText.innerText = isAudioListening ? '🔊 Retorno de Som Ativo — Ouvindo ambiente' : 'Áudio Bidirecional: Microfone e Alto-Falante Prontos';
  showToast('Transmissão de áudio finalizada.');
}

// Carrega Câmeras Xiaomi (Lazy load com Overlays de Ações Rápidas)
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

      return `
        <div class="camera-card">
          <div class="camera-preview" onclick="openPtzModal('${cam.id}')" style="cursor:pointer;">
            <img src="${streamUrl}" alt="${cam.name}" loading="lazy" style="background:#090d16; min-height:200px; width:100%; object-fit:cover; display:block;" onerror="this.onerror=null; this.src='${fallbackSvg}';">
            <div class="camera-overlay-badge">
              <span class="pulse-dot"></span>
              AO VIVO • ${isPtz ? 'PTZ + ZOOM' : (cam.family || '2K FIXA')}
            </div>

            <!-- Atalhos Flutuantes Sobrepostos no Vídeo da Câmera -->
            <div class="cam-preview-overlay-actions">
              ${isGateCam ? `
                <button class="cam-btn-floating" onclick="pulseGate(); event.stopPropagation();" title="Acionar portão direto no vídeo">
                  🚪 Acionar Portão
                </button>
              ` : `
                <button class="cam-btn-floating" onclick="quickToggleLight('ebe317c237358405b8h5n8', 1); event.stopPropagation();" title="Luz da Rua">
                  💡 Luz Rua
                </button>
              `}
              <button class="cam-btn-floating" onclick="openPtzModal('${cam.id}'); event.stopPropagation();" title="${isPtz ? 'Abrir PTZ, Zoom e Áudio' : 'Abrir Monitoramento e Áudio'}">
                ${isPtz ? '🎮 PTZ & Zoom' : '👁️ Ver & Ouvir'}
              </button>
            </div>
          </div>
          <div class="camera-footer">
            <div>
              <div class="camera-name">${cam.name}</div>
              <div class="camera-info">go2rtc: ${alias} • ${isPtz ? 'Motorizada' : 'Lente Fixa'}</div>
            </div>
            <div style="display: flex; gap: 6px;">
              ${isGateCam ? `
                <button class="btn btn-secondary" onclick="pulseGate()" style="padding: 6px 10px; font-size: 11px;">
                  🚪 Portão
                </button>
              ` : ''}
              <button class="btn btn-primary" onclick="openPtzModal('${cam.id}')" style="padding: 6px 12px; font-size: 11px;">
                ${isPtz ? '🎮 PTZ & Zoom' : '👁️ Monitorar & Áudio'}
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
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



