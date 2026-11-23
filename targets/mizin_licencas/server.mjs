import { createServer } from 'node:http';
import { randomBytes, randomUUID, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { createReadStream, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalog, digest, fail, openStore } from './licensing.mjs';
import { stripeCheckout, stripeEvent, fulfillStripe } from './payments.mjs';
import { wireManager } from './wire-manager.mjs';

const derive = promisify(scrypt);
const assets = new Map([['/',['index.html','text/html']],['/app.js',['app.js','text/javascript']],['/style.css',['style.css','text/css']]]);
const port = Number(process.env.PORT || 4381);
const origin = new URL(process.env.LICENSE_ORIGIN || 'http://127.0.0.1:'+port);
const stripeKey = process.env.STRIPE_SECRET_KEY;
const webhook = process.env.STRIPE_WEBHOOK_SECRET;
const sandbox = !stripeKey && !webhook;
const live = stripeKey?.startsWith('sk_live_') === true;
if (!sandbox && (!webhook || !/^sk_(test|live)_/.test(stripeKey))) throw Error('Configure as duas credenciais Stripe.');
if (sandbox && !['127.0.0.1','localhost'].includes(origin.hostname)) throw Error('Simulação disponível apenas em loopback.');
if (live && origin.protocol !== 'https:') throw Error('Pagamentos reais exigem HTTPS.');
if (live && !process.env.LICENSE_CATALOG) throw Error('Configure o catálogo comercial em LICENSE_CATALOG.');
const dir = process.env.LICENSE_DATA || fileURLToPath(new URL('./runtime/',import.meta.url));
mkdirSync(dir,{recursive:true,mode:0o700});
const store = openStore(join(dir,sandbox?'local.sqlite':live?'live.sqlite':'stripe-test.sqlite'));
const db = store.db;
function editionPath(product,release,file) {
  if (![product,release].every(v=>typeof v==='string' && /^[a-z0-9_-]+$/.test(v))) fail('Build inválido.');
  return join(dir,'wire-releases',product,release,file);
}
const wire = wireManager(store,(product,release)=>{
  const path=editionPath(product,release,'manifest.json');
  if (!existsSync(path)) return null;
  const manifest=JSON.parse(readFileSync(path,'utf8'));
  if (manifest.product!==product || manifest.release!==release || !/^[0-9a-f]{32}$/.test(manifest.channel)) fail('Manifesto de edição inválido.',503);
  return manifest.channel;
});
const managerFile = join(dir,'Mizin-Wire-'+digest(origin.origin+'|'+wire.publicBlob)+'.zip');
const sessionAttributes = '; HttpOnly; SameSite=Lax; Path=/'+(origin.protocol === 'https:'?'; Secure':'');
const attempts = new Map();
function limit(ip) {
  const now = Date.now();
  const record = attempts.get(ip);
  if (!record || now >= record.until) attempts.set(ip,{n:1,until:now+60000});
  else if (++record.n > 20) fail('Aguarde um minuto antes de tentar novamente.',429);
}
setInterval(() => {for (const [ip,r] of attempts) if (Date.now() >= r.until) attempts.delete(ip);},60000).unref();

async function body(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') fail('Envie JSON.',415);
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    if ((size += chunk.length) > 131072) fail('Pedido muito grande.',413);
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
function attachment(res,file,filename) {
  res.setHeader('Content-Type','application/octet-stream');
  res.setHeader('Content-Disposition','attachment; filename="'+filename+'"');
  const stream=createReadStream(file);
  stream.on('error',()=>res.destroy());
  res.on('close',()=>stream.destroy());
  return stream.pipe(res);
}
function parse(raw) {
  let data;
  try { data = JSON.parse(raw); } catch { fail('JSON inválido.'); }
  if (!data || Array.isArray(data) || typeof data !== 'object') fail('Objeto JSON esperado.');
  return data;
}
async function auth(data, create, res) {
  const email = typeof data.email === 'string' ? data.email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 || typeof data.password !== 'string' || data.password.length > 200) fail('E-mail ou senha inválidos.');
  let user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (create && data.password.length < 12) fail('Use pelo menos 12 caracteres na senha.');
  const [salt,stored] = (user?.credential || '').split('.');
  const usedSalt = create || !salt ? randomBytes(16).toString('hex') : salt;
  const result = await derive(data.password,usedSalt,64);
  if (create) {
    const id = randomUUID();
    const created = db.prepare('INSERT OR IGNORE INTO users VALUES(?,?,?)').run(id,email,usedSalt+'.'+result.toString('hex'));
    if (!created.changes) fail('Esta conta já existe. Use Entrar.',409);
    user = {id,email};
  } else if (!stored || !timingSafeEqual(result,Buffer.from(stored,'hex'))) fail('E-mail ou senha inválidos.',401);
  const token = randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(digest(token),user.id,Date.now()+7*86400000);
  res.setHeader('Set-Cookie','session='+token+'; Max-Age=604800'+sessionAttributes);
  return {email};
}
const server = createServer(async (req,res) => {
  const send = (data,status=200) => {res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));};
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try {
    if (req.headers.host !== origin.host) fail('Host inválido.',403);
    const url = new URL(req.url,origin);
    const path = url.pathname;
    if (req.method === 'GET' && assets.has(path)) {
      const [file,mime] = assets.get(path);
      res.setHeader('Content-Type',mime+'; charset=utf-8');
      return res.end(readFileSync(new URL('./public/'+file,import.meta.url)));
    }
    const cookie = req.headers.cookie?.match(/(?:^|;\s*)session=([0-9a-f]{64})(?:;|$)/)?.[1] || '';
    const hashed = digest(cookie);
    const user = db.prepare('SELECT u.id,u.email FROM sessions s JOIN users u ON u.id=s.owner WHERE s.token=? AND s.expires>?').get(hashed,Date.now());
    if (req.method === 'GET') {
      if (path === '/api/wire/store') {
        const plugins=catalog.products.flatMap(p=>(p.wireReleases||[]).map(release=>{
          const offer=catalog.offers.find(o=>o.items.length===1 && o.items[0]===p.id) || catalog.offers.find(o=>o.items.includes(p.id));
          return {name:p.name,product:p.id,release,offer:offer?.id,hasDemo:existsSync(editionPath(p.id,release,'demo.cwired'))};
        }));
        return send({plugins});
      }
      if (path === '/api/wire/demo') {
        const product=url.searchParams.get('product'),release=url.searchParams.get('release');
        if (!catalog.products.find(p=>p.id===product)?.wireReleases?.includes(release)) fail('Demo indisponível.',404);
        const file=editionPath(product,release,'demo.cwired');
        if (!existsSync(file)) fail('Demo indisponível.',404);
        return attachment(res,file,product+'--'+release+'--demo.cwired');
      }
      if (path === '/api/catalog') return send({catalog,sandbox,test:!live,email:user?.email,managerAvailable:existsSync(managerFile)});
      if (path === '/api/wire/issuer') return send({publicBlob:wire.publicBlob});
      if (path === '/api/wire/library' && user) return send({plugins:wire.library(user.id)});
      if (path === '/downloads/mizin-wire.zip') {
        if (!existsSync(managerFile)) fail('Gerenciador ainda não empacotado para este ambiente.',404);
        res.setHeader('Content-Type','application/zip');
        res.setHeader('Content-Disposition','attachment; filename="Mizin-Wire.zip"');
        return res.end(readFileSync(managerFile));
      }
      if (path === '/api/public-key') return send({algorithm:'Ed25519',key:store.publicKey});
      if (path === '/api/account' && user) return send({licenses:store.dashboard(user.id),orders:db.prepare('SELECT id,action,offer,total,quantity,paid FROM orders WHERE owner=? ORDER BY rowid DESC LIMIT 50').all(user.id)});
      fail('Recurso indisponível.',user?404:401);
    }
    if (req.method !== 'POST') fail('Método inválido.',405);
    if (req.headers.origin && req.headers.origin !== origin.origin) fail('Origem inválida.',403);
    const raw = await body(req);
    if (path === '/api/stripe/webhook' && !sandbox) {
      fulfillStripe(store,stripeEvent(raw,req.headers['stripe-signature'],webhook),live);
      return send({received:true});
    }
    const data = parse(raw);
    if (path === '/api/register' || path === '/api/login') {
      limit(req.socket.remoteAddress);
      return send(await auth(data,path === '/api/register',res));
    }
    if (['/api/activate','/api/verify'].includes(path)) {
      for (const field of ['serial','product','release','installationKey']) if (typeof data[field] !== 'string') fail('Campo inválido: '+field);
      return send({token:store.authorize(data,path === '/api/activate')});
    }
    if (!user) fail('Entre para continuar.',401);
    if (path === '/api/wire/download') {
      wire.grant(user.id,data,false);
      if (![data.product,data.release].every(value => typeof value === 'string' && /^[a-z0-9_-]+$/.test(value))) fail('Identificador de distribuição inválido.');
      const filename = data.product+'--'+data.release+'.cwired';
      const edition = editionPath(data.product,data.release,'licensed.cwired');
      const file = existsSync(edition) ? edition : join(dir,'wire-plugins',filename);
      if (!existsSync(file)) fail('Build Wire ainda não publicado neste ambiente.',404);
      return attachment(res,file,filename);
    }
    if (path === '/api/wire/activate' || path === '/api/wire/verify') {
      return send(wire.grant(user.id,data,path === '/api/wire/activate'));
    }
    if (path === '/api/logout') {
      db.prepare('DELETE FROM sessions WHERE token=?').run(hashed);
      res.setHeader('Set-Cookie','session=; Max-Age=0'+sessionAttributes);
      return send({ok:true});
    }
    if (path === '/api/orders' || path === '/api/resume-order') {
      if (typeof data.requestId !== 'string' || !/^[0-9a-f-]{36}$/.test(data.requestId)) fail('Identificador do pedido inválido.');
      const order = path === '/api/orders' ? store.order(user.id,data,data.requestId)
        : db.prepare('SELECT * FROM orders WHERE id=? AND owner=?').get(data.requestId,user.id);
      if (!order) fail('Pedido não encontrado.',404);
      if (order.paid) return send({paid:true});
      let checkout = null;
      if (!sandbox) {
        let session = db.prepare('SELECT url,expires FROM checkouts WHERE order_id=?').get(order.id);
        if (!session) {
          session = await stripeCheckout(order,stripeKey,origin.origin);
          db.prepare('INSERT OR IGNORE INTO checkouts VALUES(?,?,?)').run(order.id,session.url,session.expires);
        }
        if (Date.now() >= session.expires*1000) fail('O checkout expirou. Crie um novo pedido.',409);
        checkout = session.url;
      }
      return send({id:order.id,total:order.total,checkout});
    }
    if (path === '/api/test-payment' && sandbox) {
      const order = db.prepare('SELECT * FROM orders WHERE id=? AND owner=?').get(data.id,user.id);
      if (!order) fail('Pedido não encontrado.',404);
      return send({serial:store.settle(order.id,order.total,catalog.currency)});
    }
    if (path === '/api/release-machine') {
      store.releaseDevice(user.id,data.serial,data.device);
      return send({ok:true});
    }
    fail('Rota não encontrada.',404);
  } catch (e) {
    if (!e.status) console.error('Falha no serviço:',e.name,e.code || '');
    send({error:e.status?e.message:'Erro interno no serviço.'},e.status || 500);
  }
});
server.listen(port,'127.0.0.1',() => console.log('Central de licenças · '+origin.origin));
