import { setIconButton } from './icons.js';

export class LivePlayer {
  constructor() {
    this.dialog = document.querySelector('#player-dialog');
    this.select = document.querySelector('#camera-view');
    this.quality = document.querySelector('#quality');
    this.quality.value = localStorage.getItem('camera-quality') || 'balanced';
    this.channels = [1, 2].map((number, index) => ({
      index, pane: document.querySelector('#pane-' + number),
      video: document.querySelector(index ? '#secondary-player' : '#player'),
      state: document.querySelector(index ? '#secondary-state' : '#player-state'),
      label: document.querySelector('#view-label-' + number),
      resolution: document.querySelector('#view-resolution-' + number),
      focus: document.querySelector('#view-focus-' + number), generation: 0, retries: 0, timer: null, stableTimer: null, active: false, connected: false,
    }));
    for (const channel of this.channels) {
      channel.focus.onclick = () => this.focus(channel.view.id);
      channel.video.addEventListener('pointerdown', () => { if (channel.view) this.focus(channel.view.id); });
      channel.video.addEventListener('loadedmetadata', () => { channel.resolution.textContent = `${channel.video.videoWidth}×${channel.video.videoHeight}`; });
      channel.video.addEventListener('playing', () => {
        clearTimeout(channel.timer); clearTimeout(channel.stableTimer); channel.connected = true; channel.state.hidden = true; this.status();
        const generation = channel.generation;
        channel.stableTimer = setTimeout(() => { if (channel.active && channel.connected && channel.generation === generation) channel.retries = 0; }, 10000);
      });
      channel.video.addEventListener('error', () => { if (channel.active && channel.video.error) this.retry(channel); });
      channel.video.addEventListener('ended', () => { if (channel.active) this.retry(channel); });
      channel.video.addEventListener('volumechange', () => {
        if (!channel.video.muted && channel.video.volume > 0 && channel.view) this.focus(channel.view.id);
        this.audioLabel();
      });
    }
    document.querySelector('#close-player').onclick = () => this.close();
    this.dialog.addEventListener('close', () => this.stop());
    this.select.onchange = () => this.focus(this.select.value);
    this.quality.onchange = () => { localStorage.setItem('camera-quality', this.quality.value); this.startVisible(); };
    document.querySelector('#retry-video').onclick = () => { const channel = this.selected(); if (channel) { channel.retries = 0; this.start(channel); } };
    document.querySelector('#listen-audio').onclick = () => {
      const selected = this.selected(); if (!selected) return;
      const enabled = selected.video.muted || selected.video.volume === 0;
      for (const channel of this.channels) channel.video.muted = channel !== selected || !enabled;
      if (enabled) selected.video.volume = 1;
      this.audioLabel();
    };
    document.querySelector('#toggle-views').onclick = () => { this.expanded = !this.expanded; this.layout(); };
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.dialog.open) this.close(); });
  }
  open(camera, focusId = camera.views[0].id) {
    this.stop(); this.camera = camera; this.expanded = false;
    document.querySelector('#player-title').textContent = camera.name;
    this.select.replaceChildren();
    for (const view of camera.views.slice(0, 2)) { const option = document.createElement('option'); option.value = view.id; option.textContent = view.label; this.select.append(option); }
    for (const channel of this.channels) {
      channel.view = camera.views[channel.index]; channel.retries = 0; channel.video.muted = true;
      if (channel.view) { channel.label.textContent = channel.view.label; channel.resolution.textContent = ''; channel.focus.setAttribute('aria-label', 'Selecionar ' + channel.view.label + ' para os controles'); }
    }
    this.select.value = camera.views.some(view => view.id === focusId) ? focusId : camera.views[0].id;
    const dual = camera.views.length > 1;
    document.querySelector('#view-control').hidden = !dual;
    document.querySelector('#toggle-views').hidden = !dual;
    document.querySelector('#physical-controls').hidden = !dual;
    if (!this.dialog.open) this.dialog.showModal();
    this.layout();
  }
  selected() { return this.channels.find(channel => channel.view?.id === this.select.value); }
  focus(id) {
    if (!this.camera) return;
    this.select.value = id;
    for (const channel of this.channels) {
      const selected = channel.view?.id === id;
      channel.pane.classList.toggle('selected', selected);
      channel.focus.setAttribute('aria-pressed', String(selected));
      if (!selected) channel.video.muted = true;
    }
    document.querySelector('#control-target').textContent = this.selected()?.view.label || '';
    if (this.expanded) this.layout();
    this.audioLabel();
  }
  layout() {
    if (!this.camera) return;
    const dual = this.camera.views.length > 1 && !this.expanded;
    document.querySelector('#video-grid').classList.toggle('dual', dual);
    setIconButton(document.querySelector('#toggle-views'), this.expanded ? 'dual' : 'expand', this.expanded ? 'Ver duas visões' : 'Ampliar visão');
    for (const channel of this.channels) {
      const visible = !!channel.view && (!this.expanded || channel.view.id === this.select.value);
      channel.pane.hidden = !visible;
      if (visible && !channel.active) this.start(channel);
      else if (!visible) this.stopChannel(channel);
      channel.pane.classList.toggle('selected', channel.view?.id === this.select.value);
      channel.focus.setAttribute('aria-pressed', String(channel.view?.id === this.select.value));
    }
    document.querySelector('#control-target').textContent = this.selected()?.view.label || '';
    this.status();
    this.audioLabel();
  }
  startVisible() { for (const channel of this.channels) if (channel.view && !channel.pane.hidden) { channel.retries = 0; this.start(channel); } }
  start(channel) {
    if (!this.camera || !channel.view || channel.pane.hidden) return;
    this.stopChannel(channel); channel.active = true; const generation = channel.generation;
    channel.state.hidden = false; channel.state.lastElementChild.textContent = channel.retries ? 'Reconectando…' : 'Conectando…';
    channel.resolution.textContent = '';
    channel.video.src = `/api/video/${this.camera.id}?view=${encodeURIComponent(channel.view.id)}&quality=${this.quality.value}&attempt=${Date.now()}`;
    channel.video.load(); channel.video.play().catch(() => {});
    channel.timer = setTimeout(() => { if (channel.generation === generation && channel.active && channel.video.readyState < 2) this.retry(channel); }, 48000);
    this.status();
  }
  retry(channel) {
    clearTimeout(channel.timer); clearTimeout(channel.stableTimer);
    if (!channel.active || !this.dialog.open) return;
    channel.connected = false; channel.state.hidden = false; channel.state.lastElementChild.textContent = 'Reconectando…';
    if (channel.retries >= 2) { channel.state.hidden = false; channel.state.lastElementChild.textContent = 'Selecione esta visão e use Reconectar.'; this.status(); return; }
    channel.retries++; channel.timer = setTimeout(() => this.start(channel), 2000);
  }
  stopChannel(channel) { channel.active = false; channel.connected = false; channel.generation++; clearTimeout(channel.timer); clearTimeout(channel.stableTimer); channel.video.pause(); channel.video.removeAttribute('src'); channel.video.load(); }
  status() {
    const visible = this.channels.filter(channel => channel.view && !channel.pane.hidden);
    const connected = visible.filter(channel => channel.active && channel.connected).length;
    document.querySelector('#playback-state').textContent = connected === visible.length && connected ? (connected > 1 ? '● Duas visões conectadas' : '● Vídeo conectado') : `${connected}/${visible.length} visões conectadas`;
  }
  audioLabel() { const channel = this.selected(), muted = !channel || channel.video.muted || !channel.video.volume; setIconButton(document.querySelector('#listen-audio'), muted ? 'volumeOff' : 'volumeOn', muted ? 'Ouvir visão selecionada' : 'Silenciar'); }
  stop() { for (const channel of this.channels) this.stopChannel(channel); this.camera = null; }
  close() { this.stop(); if (this.dialog.open) this.dialog.close(); }
}
