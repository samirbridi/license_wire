export function validDay(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0); date.setUTCFullYear(year, month - 1, day); date.setUTCHours(0, 0, 0, 0);
  return year >= 1970 && year <= 2100 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
export function moveDay(value, offset) { if (!validDay(value)) throw new Error('Data inválida.'); const date = new Date(value + 'T12:00:00Z'); date.setUTCDate(date.getUTCDate() + offset); return date.toISOString().slice(0, 10); }
export function dayInMonth(month, day) {
  if (!/^\d{4}-\d{2}$/.test(month) || Number(month.slice(5)) < 1 || Number(month.slice(5)) > 12) throw new Error('Mês inválido.');
  const [year, number] = month.split('-').map(Number), last = new Date(Date.UTC(year, number, 0)).getUTCDate();
  const value = `${month}-${String(Math.max(1, Math.min(last, Number(day) || 1))).padStart(2, '0')}`;
  if (!validDay(value)) throw new Error('Data inválida.'); return value;
}
export function seekRecorded(periods, time) {
  if (!Array.isArray(periods) || !Number.isFinite(time)) return null;
  const sorted = periods.filter(p => Number.isFinite(p.start) && Number.isFinite(p.end) && p.end > p.start).sort((a, b) => a.start - b.start);
  for (const period of sorted) { if (time >= period.start && time < period.end) return time; if (period.start > time) return period.start; }
  return sorted.length ? sorted.at(-1).end - 1 : null;
}
export function clipPlan(periods, start, end) {
  if (!Array.isArray(periods)) return { available: false, reason: 'source_unknown', parts: null };
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) throw new Error('O fim deve ser posterior ao início.');
  const sorted = periods.filter(p => Number.isFinite(p.start) && Number.isFinite(p.end) && p.end > p.start).sort((a, b) => a.start - b.start);
  const parts = []; let cursor = start;
  for (const period of sorted) { const from = Math.max(cursor, start, period.start), to = Math.min(end, period.end); if (to > from) { parts.push({ id: period.id, start: from, end: to }); cursor = to; } }
  const covered = parts.reduce((sum, p) => sum + p.end - p.start, 0);
  return { available: true, parts, duration: end - start, covered, missing: end - start - covered };
}
