import { dayInMonth, moveDay } from './recordings-core.js';
export class RecordingsPanel {
  constructor(api) {
    this.api = api; this.dialog = document.querySelector('#recordings-dialog'); this.requestId = 0;
    this.day = document.querySelector('#recording-day'); this.month = document.querySelector('#recording-month');
    this.day.value = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    this.month.value = this.day.value.slice(0, 7);
    this.day.onchange = () => { this.month.value = this.day.value.slice(0, 7); this.load(); };
    this.month.onchange = () => { if (!this.month.value) return; try { this.day.value = dayInMonth(this.month.value, this.day.value.slice(8)); this.load(); } catch (error) { document.querySelector('#recording-status').textContent = error.message; } };
    document.querySelector('#recording-prev').onclick = () => this.step(-1);
    document.querySelector('#recording-next').onclick = () => this.step(1);
    document.querySelector('#close-recordings').onclick = () => this.close();
  }
  open(camera) { this.camera = camera; document.querySelector('#recordings-title').textContent = camera.name; if (!this.dialog.open) this.dialog.showModal(); this.load(); }
  step(offset) { if (!this.day.value) return; this.day.value = moveDay(this.day.value, offset); this.month.value = this.day.value.slice(0, 7); this.load(); }
  async load() {
    if (!this.camera || !this.day.value) return;
    const camera = this.camera, date = this.day.value, requestId = ++this.requestId;
    document.querySelector('#recording-status').textContent = 'Consultando disponibilidade…';
    document.querySelector('#recording-seek').disabled = true; document.querySelector('#download-clip').disabled = true;
    document.querySelector('#timeline-empty').textContent = 'Consultando disponibilidade…';
    try {
      const state = await this.api(`/api/recordings/${camera.id}?date=${date}`);
      if (this.requestId !== requestId || this.camera !== camera || this.day.value !== date) return;
      document.querySelector('#recording-status').textContent = state.status === 'ready' ? 'Disponibilidade recebida.' : 'O acesso às gravações do cartão ainda está em preparação.';
      document.querySelector('#timeline-empty').textContent = state.periods === null ? 'Disponibilidade do cartão ainda não consultada' : state.periods.length ? 'Períodos recebidos' : 'Nenhuma gravação neste dia';
      document.querySelector('#recording-seek').disabled = state.status !== 'ready' || !state.periods?.length;
      document.querySelector('#download-clip').disabled = !state.capabilities.export;
    } catch (error) { if (this.requestId === requestId && this.camera === camera && this.day.value === date) document.querySelector('#recording-status').textContent = error.message; }
  }
  close() { this.requestId++; this.camera = null; if (this.dialog.open) this.dialog.close(); }
}
