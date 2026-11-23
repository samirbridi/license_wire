import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes, randomUUID, verify, createPublicKey } from 'node:crypto';
import { verifyOffline } from '../licensing.mjs';

test('cadastro, compra, ativação concorrente, reinício, login e liberação via HTTP', {timeout:20000}, async t=>{
  const dir=await mkdtemp(join(tmpdir(),'mizin-test-'));
  const probe=createServer().listen(0,'127.0.0.1');
  await once(probe,'listening');
  const port=probe.address().port;
  await new Promise(resolve=>probe.close(resolve));
  let child;
  async function stop() {
    if (!child || child.exitCode!==null || child.signalCode!==null) return;
    const done=once(child,'exit');child.kill();await done;
  }
  async function start() {
    child=spawn(process.execPath,['server.mjs'],{cwd:new URL('../',import.meta.url),windowsHide:true,
      env:{...process.env,PORT:String(port),LICENSE_ORIGIN:'http://127.0.0.1:'+port,LICENSE_DATA:dir,STRIPE_SECRET_KEY:'',STRIPE_WEBHOOK_SECRET:''}});
    await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw Error('Servidor encerrou');})]);
  }
  t.after(async()=>{await stop();await rm(dir,{recursive:true,force:true});});
  const url='http://127.0.0.1:'+port+'/api/';
  let cookie='';
  async function api(path,data,status=200) {
    const r=await fetch(url+path,{method:data?'POST':'GET',headers:{Cookie:cookie,'Content-Type':'application/json'},body:data&&JSON.stringify(data)});
    const result=await r.json();
    assert.equal(r.status,status,result.error);
    if (r.headers.has('set-cookie')) cookie=r.headers.get('set-cookie').split(';')[0];
    return result;
  }
  await start();
  await api('account',null,401);
  const user={email:'qa@example.invalid',password:randomBytes(18).toString('hex')};
  await api('register',user);
  const order=await api('orders',{offer:'playout',action:'buy',quantity:1,requestId:randomUUID()});
  assert.equal((await api('resume-order',{requestId:order.id})).id,order.id);
  const {serial}=await api('test-payment',{id:order.id});
  const devices=[1,2].map(n=>({serial,label:'Estúdio '+n,product:'playout',release:'preview-1',installationKey:randomBytes(32).toString('hex')}));
  const responses=await Promise.all(devices.map(d=>fetch(url+'activate',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)})));
  assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
  const winner=responses.findIndex(r=>r.status===200);
  const {token}=await responses[winner].json();
  const {key}=await api('public-key');
  await stop();await start();
  assert.equal((await api('public-key')).key,key);
  assert.ok(verifyOffline(token,key,devices[winner]));
  await api('logout',{});
  await api('login',user);
  const account=await api('account');
  assert.equal(account.licenses[0].serial,serial);
  await api('verify',devices[winner]);
  await api('release-machine',{serial,device:account.licenses[0].devices[0].device});
  await api('verify',devices[winner],403);
  await api('activate',devices[1-winner]);
  assert.deepEqual((await api('wire/library')).plugins,[]);
  const bundle=await api('orders',{offer:'studio',quantity:1,requestId:randomUUID()});
  assert.deepEqual((await api('wire/library')).plugins,[]);
  const paid=await api('test-payment',{id:bundle.id});
  const [plugin]= (await api('wire/library')).plugins;
  assert.equal(plugin.product,'outliner');
  assert.equal(plugin.serial,undefined);
  const machine={...devices[0],...plugin,serial:paid.serial};
  await api('activate',machine,403);
  await api('wire/verify',machine,403);
  const proof=await api('wire/activate',machine);
  const blob=Buffer.from((await api('wire/issuer')).publicBlob,'base64');
  const keyWire=createPublicKey({format:'jwk', key:{kty:'EC',crv:'P-256',x:blob.subarray(8,40).toString('base64url'),y:blob.subarray(40).toString('base64url')}});
  assert.ok(verify('sha256',Buffer.from(proof.payload),{key:keyWire,dsaEncoding:'ieee-p1363'},Buffer.from(proof.signature,'base64')));
  assert.equal(JSON.parse(Buffer.from(proof.payload,'base64')).scope,'mizin-wire');
  await api('wire/activate',{...machine,installationKey:devices[1].installationKey},409);
  await api('wire/activate',{...machine,release:'preview-1'},400);
  await mkdir(join(dir,'wire-plugins'));
  await writeFile(join(dir,'wire-plugins','outliner--wire-preview-1.cwired'),'fixture');
  const file=await fetch(url+'wire/download',{method:'POST',headers:{Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(machine)});
  assert.equal(file.status,200);assert.equal(await file.text(),'fixture');
  await api('logout',{});
  await api('wire/activate',machine,401);
  await api('register',{...user,email:'other@example.invalid'});
  await api('wire/activate',machine,403);
  await api('wire/download',machine,403);
  assert.deepEqual((await api('wire/library')).plugins,[]);
  await api('login',user);
  const wireLicense=(await api('account')).licenses.find(x=>x.serial===paid.serial);
  await api('release-machine',{serial:paid.serial,device:wireLicense.devices[0].device});
  await api('wire/download',machine,403);
  await api('wire/verify',machine,403);
});
