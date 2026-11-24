import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFileSync } from 'node:child_process';
import { fail } from './licensing.mjs';

const dir = process.env.LICENSE_DATA || fileURLToPath(new URL('./runtime/',import.meta.url));
const subDir = join(dir,'submissions');
mkdirSync(subDir,{recursive:true,mode:0o700});

const adminEmails = new Set((process.env.ADMIN_EMAILS||'').split(',').map(e=>e.trim().toLowerCase()).filter(Boolean));

function isAdmin(user) {
  return !!(user&&user.email) && adminEmails.size>0 && adminEmails.has(user.email.toLowerCase());
}

function requireAdmin(user) {
  if (!isAdmin(user)) fail('Apenas administradores podem aprovar ou rejeitar submissões.',403);
}

function slugify(text) {
  return String(text||'').toLowerCase()
    .replace(/[^a-z0-9]+/g,'-')
    .replace(/^-+|-+$/g,'')
    .slice(0,60) || 'submissao';
}

function parseMultipart(req) {
  return new Promise((resolve,reject)=>{
    const ct = req.headers['content-type']||'';
    const m = ct.match(/boundary="?([^";]+)"?/);
    if (!m) return reject(fail('Content-Type multipart/form-data esperado.',415));
    const boundary = '--'+m[1];
    let body = Buffer.alloc(0);
    req.on('data',c=>{body=Buffer.concat([body,c]);});
    req.on('end',()=>{
      try {
        const parts = body.toString('latin1').split(boundary).slice(1,-1);
        const fields = {};
        const files = {};
        for (const part of parts) {
          const [head, ...rest] = part.split('\r\n\r\n');
          if (!head) continue;
          const bodyPart = rest.join('\r\n\r\n').replace(/\r\n$/,'');
          const nameMatch = head.match(/name="([^"]+)"/);
          const filenameMatch = head.match(/filename="([^"]+)"/);
          if (filenameMatch) {
            const name = nameMatch?.[1]||'file';
            files[name] = { filename: filenameMatch[1], data: Buffer.from(bodyPart,'latin1') };
          } else if (nameMatch) {
            fields[nameMatch[1]] = bodyPart.trim();
          }
        }
        resolve({fields,files});
      } catch(e) { reject(fail('Erro ao processar upload.',400)); }
    });
    req.on('error',e=>reject(fail('Erro na leitura do upload.',400)));
  });
}

function readCatalog() {
  const path = join(fileURLToPath(new URL('.',import.meta.url)),'..','catalog.json');
  return JSON.parse(readFileSync(path,'utf8'));
}

function writeCatalog(cat) {
  const path = join(fileURLToPath(new URL('.',import.meta.url)),'..','catalog.json');
  writeFileSync(path,JSON.stringify(cat,null,2)+'\n','utf8');
}

function ensureProduct(cat, productId, productName) {
  let p = cat.products.find(x=>x.id===productId);
  if (p) return p;
  p = { id:productId, name:productName||productId, kind:'Plugin Wire', terms:12, wireReleases:[], releases:{} };
  cat.products.push(p);
  return p;
}

function ensureOffer(cat, productId, offerName, priceCents=9900) {
  let o = cat.offers.find(x=>x.id===productId);
  if (o) return o;
  o = { id:productId, name:offerName||productId, items:[productId], price:priceCents, renew:2900 };
  cat.offers.push(o);
  return o;
}

function compileWire(product, release, channel, wireSourcePath, targetDir) {
  return new Promise((resolve,reject)=>{
    const wireExe = join('C:','Program Files','Resolume Wire','Wire.exe');
    const probe = join(targetDir,'.probe-'+randomUUID()+'.wire');
    const demoSource = join(targetDir,'.demo-'+randomUUID()+'.wire');
    const licensedSource = join(targetDir,'.licensed-'+randomUUID()+'.wire');
    const demoOut = join(targetDir,'demo.cwired');
    const licensedOut = join(targetDir,'licensed.cwired');
    const manifestOut = join(targetDir,'manifest.json');

    const makeProbe = join(fileURLToPath(new URL('.',import.meta.url)),'..','manager','make-probe.ps1');
    const prepareEdition = join(fileURLToPath(new URL('.',import.meta.url)),'..','manager','prepare-edition.mjs');

    const ps = spawn('powershell.exe',['-ExecutionPolicy','Bypass','-File',makeProbe,'-OutputPath',probe]);
    let psOut='';
    ps.stdout.on('data',c=>psOut+=c.toString());
    ps.stderr.on('data',c=>psOut+=c.toString());
    ps.on('close',async code=>{
      if (code!==0) { reject(fail('Falha ao gerar probe do Wire: '+psOut,500)); return; }
      try {
        const args=[wireSourcePath,probe,product,release,channel,demoSource,licensedSource];
        const node = spawn(process.execPath,[prepareEdition,...args]);
        let nodeOut='', nodeErr='';
        node.stdout.on('data',c=>nodeOut+=c.toString());
        node.stderr.on('data',c=>nodeErr+=c.toString());
        node.on('close',async ncode=>{
          if (ncode!==0) { reject(fail('Falha ao preparar edições: '+nodeErr,500)); return; }
          const compile = (input,output)=>new Promise((res,rej)=>{
            const proc = spawn(wireExe,['compile','"'+input+'"','--output','"'+output+'"'],{shell:true});
            let out='',err='';
            proc.stdout.on('data',c=>out+=c.toString());
            proc.stderr.on('data',c=>err+=c.toString());
            proc.on('close',c=>{
              if (c!==0 || !existsSync(output)) rej(fail('Falha ao compilar '+input+': '+err,500));
              else res();
            });
          });
          try {
            await compile(demoSource,demoOut);
            await compile(licensedSource,licensedOut);
            const crypto = await import('node:crypto');
            const manifest = {
              product, release, channel,
              sourceSha256: createHash('sha256').update(readFileSync(wireSourcePath)).digest('hex'),
              compiler: execFileSync('powershell.exe',['-Command','(Get-Item "'+wireExe+'").VersionInfo.FileVersion'],{encoding:'utf8'}).trim(),
              demoSha256: createHash('sha256').update(readFileSync(demoOut)).digest('hex'),
              licensedSha256: createHash('sha256').update(readFileSync(licensedOut)).digest('hex')
            };
            writeFileSync(manifestOut,JSON.stringify(manifest,null,2)+'\n','utf8');
            for (const f of [probe,demoSource,licensedSource]) { if (existsSync(f)) { try{unlinkSync(f);}catch{} } }
            resolve({demo:demoOut,licensed:licensedOut,manifest:manifestOut});
          } catch(e) { reject(fail(e.message||'Erro na compilação',500)); }
        });
      } catch(e) { reject(fail(e.message||'Erro na preparação',500)); }
    });
  });
}

export function initSubmissions(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS submissions (
      id TEXT PRIMARY KEY,
      author_email TEXT NOT NULL,
      project_name TEXT NOT NULL,
      product_id TEXT NOT NULL,
      release TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      wire_path TEXT,
      cwired_licensed_path TEXT,
      cwired_demo_path TEXT,
      manifest_path TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      approved_by TEXT,
      rejected_by TEXT,
      rejection_reason TEXT
    );
  `);

  return {
    async list(user) {
      const rows = db.prepare('SELECT * FROM submissions ORDER BY created_at DESC').all();
      const arr = Array.isArray(rows) ? rows : [];
      if (!isAdmin(user)) {
        return arr.filter(r=>r.author_email===user.email);
      }
      return arr;
    },
    async upload(user, req) {
      const {fields,files} = await parseMultipart(req);
      const wireFile = files.wire;
      if (!wireFile) fail('Arquivo .wire não enviado.',400);
      if (!wireFile.filename.toLowerCase().endsWith('.wire')) fail('O arquivo deve ter extensão .wire.',400);
      const productId = fields.product_id||'';
      const release = fields.release||'';
      const projectName = fields.project_name||wireFile.filename.replace(/\.wire$/i,'');
      if (!/^[a-z0-9_-]+$/.test(productId)) fail('product_id inválido (use apenas letras minusculas, numeros, hifen e underline).',400);
      if (!/^[a-z0-9_-]+$/.test(release)) fail('release inválido (use apenas letras minusculas, numeros, hifen e underline).',400);
      const id = randomUUID();
      const subFolder = join(subDir,id);
      mkdirSync(subFolder,{recursive:true});
      const wirePath = join(subFolder, wireFile.filename);
      writeFileSync(wirePath, wireFile.data);
      const now=Date.now();
      db.prepare('INSERT INTO submissions VALUES(?,?,?,?,?,?,?,?,?,?,?,?,NULL,NULL,NULL)')
        .run(id,user.email,projectName,productId,release,'pending',wirePath,null,null,null,now,now);
      return {id,status:'pending',projectName,productId,release};
    },
    async approve(user, id) {
      requireAdmin(user);
      const row = db.prepare('SELECT * FROM submissions WHERE id=?').get(id);
      if (!row) fail('Submissão não encontrada.',404);
      if (row.status!=='pending') fail('Submissão já foi processada (status: '+row.status+').',409);
      const cat = readCatalog();
      ensureProduct(cat, row.product_id, row.project_name);
      ensureOffer(cat, row.product_id, row.project_name);
      const p = cat.products.find(x=>x.id===row.product_id);
      if (!p.wireReleases.includes(row.release)) p.wireReleases.push(row.release);
      p.releases[row.release] = new Date().toISOString().slice(0,10);
      const targetDir = join(dir,'wire-releases',row.product_id,row.release);
      mkdirSync(targetDir,{recursive:true});
      let result;
      try {
        result = await compileWire(row.product_id,row.release,randomBytes(16).toString('hex'),row.wire_path,targetDir);
      } catch(e) {
        db.prepare('UPDATE submissions SET status=?, updated_at=? WHERE id=?').run('error',Date.now(),id);
        throw e;
      }
      writeCatalog(cat);
      db.prepare('UPDATE submissions SET status=?, updated_at=?, approved_by=?, cwired_licensed_path=?, cwired_demo_path=?, manifest_path=? WHERE id=?')
        .run('approved',Date.now(),user.email,result.licensed,result.demo,result.manifest,id);
      return {id,status:'approved',productId:row.product_id,release:row.release};
    },
    async reject(user, id, reason) {
      requireAdmin(user);
      const row = db.prepare('SELECT * FROM submissions WHERE id=?').get(id);
      if (!row) fail('Submissão não encontrada.',404);
      if (row.status!=='pending') fail('Submissão já foi processada (status: '+row.status+').',409);
      db.prepare('UPDATE submissions SET status=?, updated_at=?, rejected_by=?, rejection_reason=? WHERE id=?')
        .run('rejected',Date.now(),user.email,reason||'',id);
      return {id,status:'rejected'};
    },
    async remove(user, id) {
      requireAdmin(user);
      const row = db.prepare('SELECT * FROM submissions WHERE id=?').get(id);
      if (!row) fail('Submissão não encontrada.',404);
      if (row.wire_path && existsSync(row.wire_path)) { try{unlinkSync(row.wire_path);}catch{} }
      const subDir2 = join(subDir,id);
      if (existsSync(subDir2)) { try{rmSync(subDir2,{recursive:true,force:true});}catch{} }
      db.prepare('DELETE FROM submissions WHERE id=?').run(id);
      return {id,status:'deleted'};
    },
    getAdminEmails(){ return [...adminEmails]; },
    isAdmin
  };
}

export {adminEmails};
