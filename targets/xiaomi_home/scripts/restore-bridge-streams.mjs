import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function validateStreams(entries) {
  if (!Array.isArray(entries) || entries.length < 1 || entries.length > 32) throw new Error('Invalid saved sources');
  const names = new Set();
  for (const entry of entries) {
    if (!/^[a-z0-9_]{1,80}$/.test(entry.alias) || names.has(entry.alias)) throw new Error('Invalid saved alias');
    const source = new URL(entry.source);
    if (source.protocol !== 'xiaomi:' || !source.hostname || !/^\d+$/.test(source.searchParams.get('did') ?? '') || !/^[a-z0-9_.]+$/.test(source.searchParams.get('model') ?? '')) throw new Error('Invalid saved Xiaomi source');
    names.add(entry.alias);
  }
  return entries;
}

export async function restoreStreams(entries, fetcher = fetch) {
  validateStreams(entries);
  const base = 'http://127.0.0.1:19843/api/streams';
  const response = await fetcher(base, { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error('Bridge unavailable');
  const current = await response.json(); let restored = 0;
  for (const { alias, source } of entries) {
    if (Object.hasOwn(current, alias)) continue;
    const endpoint = new URL(base); endpoint.searchParams.set('name', alias); endpoint.searchParams.set('src', source);
    const result = await fetcher(endpoint, { method: 'PUT', signal: AbortSignal.timeout(5000) });
    await result.body?.cancel();
    if (!result.ok) throw new Error('Bridge registration failed');
    restored++;
  }
  return { restored, preserved: entries.length - restored };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const target = resolve(dirname(fileURLToPath(import.meta.url)), '..');
    const entries = JSON.parse(readFileSync(join(target, 'runtime/central/bridge-streams.json'), 'utf8').replace(/^\uFEFF/, ''));
    console.log(JSON.stringify(await restoreStreams(entries)));
  } catch { console.error('Nao foi possivel restaurar as fontes locais preservadas. Confira a ponte e a configuracao privada.'); process.exitCode = 1; }
}
