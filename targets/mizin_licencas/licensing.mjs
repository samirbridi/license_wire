import { DatabaseSync } from 'node:sqlite';
import { generateKeyPairSync, randomBytes, randomUUID, createHash, sign, verify } from 'node:crypto';
import { readFileSync } from 'node:fs';

export const catalog = JSON.parse(readFileSync(process.env.LICENSE_CATALOG || new URL('./catalog.json', import.meta.url)));
export const digest = value => createHash('sha256').update(value).digest('hex');
export const fail = (message, status = 400) => { throw Object.assign(new Error(message), {status}); };
const day = 86400000;
const isoDay = ms => new Date(ms).toISOString().slice(0, 10);

function addMonths(date, months) {
  const result = new Date(date + 'T00:00:00Z');
  const originalDay = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months + 1, 0);
  result.setUTCDate(Math.min(originalDay, result.getUTCDate()));
  return isoDay(result);
}

function transaction(db, work) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = work();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function openStore(file, now = Date.now) {
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS config (name TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, credential TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS licenses (serial TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users, offer TEXT NOT NULL, seats INTEGER NOT NULL, rights TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users, offer TEXT NOT NULL, action TEXT NOT NULL, quantity INTEGER NOT NULL, total INTEGER NOT NULL, terms TEXT NOT NULL, target TEXT, paid INTEGER NOT NULL DEFAULT 0, serial TEXT);
    CREATE TABLE IF NOT EXISTS devices (serial TEXT NOT NULL REFERENCES licenses, device TEXT NOT NULL, label TEXT NOT NULL, PRIMARY KEY(serial,device));
    CREATE TABLE IF NOT EXISTS checkouts (order_id TEXT PRIMARY KEY REFERENCES orders, url TEXT NOT NULL, expires INTEGER NOT NULL);
  `);
  const keys = transaction(db, () => {
    const row = db.prepare("SELECT value FROM config WHERE name='issuer'").get();
    if (row) return JSON.parse(row.value);
    const keys = generateKeyPairSync('ed25519', {privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
    db.prepare("INSERT INTO config VALUES ('issuer',?)").run(JSON.stringify(keys));
    return keys;
  });
  const license = serial => db.prepare('SELECT * FROM licenses WHERE serial=?').get(serial);
  function owned(owner, serial) {
    const record = license(serial);
    if (record?.owner !== owner) fail('Licença não encontrada.',404);
    return record;
  }
  function order(owner, {offer, quantity, action = 'buy', serial = null}, requestId = randomUUID()) {
    if (!['buy','renew','expand'].includes(action)) fail('Operação desconhecida.');
    const existing = action === 'buy' ? null : owned(owner, serial);
    const plan = catalog.offers.find(x => x.id === (existing?.offer ?? offer));
    if (!plan) fail('Produto indisponível.');
    const prior = db.prepare('SELECT * FROM orders WHERE id=?').get(requestId);
    if (prior) {
      if (prior.owner !== owner || prior.action !== action || prior.offer !== plan.id || prior.target !== (existing?.serial ?? null) || (action !== 'renew' && prior.quantity !== quantity)) fail('Pedido incompatível.',409);
      return prior;
    }
    if (action === 'renew') quantity = existing.seats;
    if (!Number.isSafeInteger(quantity) || quantity < 1 || (action !== 'renew' && quantity > 100)) fail('Selecione entre 1 e 100 máquinas por compra.');
    const terms = existing ? JSON.parse(existing.rights) : Object.fromEntries(plan.items.map(id => [id,{months:catalog.products.find(x => x.id === id).terms}]));
    if (action === 'renew' && !Object.values(terms).some(x => x.months > 0)) fail('Esta licença já inclui todas as atualizações.');
    const base = action === 'renew' ? plan.renew : plan.price;
    const tier = catalog.tiers.filter(t => quantity >= t.from).at(-1);
    const total = Math.round(quantity * base * (100-tier.discount) / 100);
    db.prepare('INSERT INTO orders(id,owner,offer,action,quantity,total,terms,target) VALUES(?,?,?,?,?,?,?,?)')
      .run(requestId,owner,plan.id,action,quantity,total,JSON.stringify(terms),existing?.serial ?? null);
    return db.prepare('SELECT * FROM orders WHERE id=?').get(requestId);
  }
  function settle(id, amount, currency) {
    return transaction(db, () => {
      const o = db.prepare('SELECT * FROM orders WHERE id=?').get(id);
      if (!o || o.total !== amount || currency !== catalog.currency) fail('Pagamento incompatível.');
      if (o.paid) return o.serial;
      const today = isoDay(now());
      let serial = o.target;
      if (o.action === 'buy') {
        serial = 'MZ-' + randomBytes(16).toString('hex').toUpperCase().match(/.{4}/g).join('-');
        const rights = JSON.parse(o.terms);
        for (const rule of Object.values(rights)) rule.until = rule.months === null ? null : addMonths(today, rule.months);
        db.prepare('INSERT INTO licenses VALUES(?,?,?,?,?)').run(serial,o.owner,o.offer,o.quantity,JSON.stringify(rights));
      } else {
        const record = owned(o.owner,serial);
        if (o.action === 'expand') {
          db.prepare('UPDATE licenses SET seats=seats+? WHERE serial=?').run(o.quantity,serial);
        } else {
          const rights = JSON.parse(record.rights);
          for (const rule of Object.values(rights)) {
            if (rule.months > 0) rule.until = addMonths(rule.until > today ? rule.until : today,rule.months);
          }
          db.prepare('UPDATE licenses SET rights=? WHERE serial=?').run(JSON.stringify(rights),serial);
        }
      }
      db.prepare('UPDATE orders SET paid=1, serial=? WHERE id=?').run(serial,id);
      return serial;
    });
  }
  function authorize({serial, product, release, installationKey, label}, activate, wireOwner = null) {
    if (typeof installationKey !== 'string' || !/^[a-f0-9]{64}$/.test(installationKey)) fail('Identidade de instalação inválida.');
    const device = digest(installationKey);
    return transaction(db, () => {
      const record = license(serial);
      const rights = record && JSON.parse(record.rights);
      const item = catalog.products.find(x => x.id === product);
      if (!item || !rights || !Object.hasOwn(rights,product)) fail('Licença não habilitada para o produto.',403);
      if (item.wireReleases?.includes(release)) {
        if (wireOwner !== record.owner) fail('Entre no Gerenciador Mizin para ativar a edição Wire.',403);
      } else if (wireOwner !== null) fail('A edição selecionada usa ativação direta.',400);
      if (!Object.hasOwn(item.releases,release)) fail('Versão desconhecida.');
      const until = rights[product].until;
      if (until && item.releases[release] > until) fail('Esta versão requer renovação das atualizações.',403);
      const slot = db.prepare('SELECT 1 FROM devices WHERE serial=? AND device=?').get(serial,device);
      if (!slot) {
        if (!activate) fail('Instalação desativada.',403);
        const count = db.prepare('SELECT COUNT(*) AS n FROM devices WHERE serial=?').get(serial).n;
        if (count >= record.seats) fail('Limite de máquinas atingido.',409);
        if (typeof label !== 'string' || !label.trim() || label.length > 100) fail('Informe o nome da máquina.');
        db.prepare('INSERT INTO devices VALUES(?,?,?)').run(serial,device,label.trim());
      }
      const issued = now();
      const payload = Buffer.from(JSON.stringify({v:1,device,product,release,issued,expires:issued+30*day})).toString('base64url');
      return payload + '.' + sign(null,Buffer.from(payload),keys.privateKey).toString('base64url');
    });
  }
  function dashboard(owner) {
    return db.prepare('SELECT serial,offer,seats,rights FROM licenses WHERE owner=? ORDER BY rowid DESC').all(owner).map(x => ({
      ...x,rights:JSON.parse(x.rights),devices:db.prepare('SELECT device,label FROM devices WHERE serial=?').all(x.serial)
    }));
  }
  function releaseDevice(owner,serial,device) {
    owned(owner,serial);
    db.prepare('DELETE FROM devices WHERE serial=? AND device=?').run(serial,device);
  }
  return {db,publicKey:keys.publicKey,order,settle,authorize,dashboard,releaseDevice};
}

export function verifyOffline(token, pinnedPublicKey, {product,release,installationKey}, now = Date.now()) {
  try {
    const parts = token.split('.');
    if (parts.length !== 2 || !verify(null,Buffer.from(parts[0]),pinnedPublicKey,Buffer.from(parts[1],'base64url'))) return false;
    const p = JSON.parse(Buffer.from(parts[0],'base64url'));
    return p.v === 1 && p.product === product && p.release === release && p.device === digest(installationKey)
      && Number.isSafeInteger(p.issued) && Number.isSafeInteger(p.expires) && p.issued <= now && now < p.expires;
  } catch { return false; }
}
