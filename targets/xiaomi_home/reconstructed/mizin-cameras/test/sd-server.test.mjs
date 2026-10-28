import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {createCentral} from '../server.mjs';
async function fixture(sdAdapter,keepOpen=false){
 const runtime=mkdtempSync(join(tmpdir(),'mizin-sd-test-'));let args,spawns=0;
 const app=createCentral({runtime,port:0,cameras:[{id:'camera',sourceAlias:'live',views:[{id:'main',sourceAlias:'live'}]}],sdAdapter,spawnProcess(_exe,input){
  args=input;spawns++;const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{child.stdout.end();child.emit('close',0);};
  setImmediate(()=>{child.stdout.write('test-only-media');if(!keepOpen){child.stdout.end();setImmediate(()=>child.emit('close',0));}});return child;
 }});
 const origin='http://127.0.0.1:'+await app.start();
 const login=await fetch(origin+'/api/session',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({code:app.bootstrap})});
 const headers={Cookie:login.headers.get('set-cookie').split(';')[0],Origin:origin};
 return {app,origin,headers,get args(){return args;},get spawns(){return spawns;},async close(){await app.close();if(!resolve(runtime).startsWith(resolve(tmpdir())+sep)||!runtime.includes('mizin-sd-test-'))throw new Error('Unsafe cleanup');rmSync(runtime,{recursive:true,force:true});}};
}
test('SD export excludes unvalidated audio and preserves input timestamps',async()=>{
 let closes=0;
 const f=await fixture({async open(){let closed=false;return{alias:'private_sd_alias',duration:5,async close(){if(!closed){closed=true;closes++;}}};}});
 try{
  assert.equal((await fetch(f.origin+'/api/clip/camera?at=100&end=105')).status,401);
  const r=await fetch(f.origin+'/api/clip/camera?at=100&end=105',{headers:f.headers});await r.arrayBuffer();
  assert.equal(r.status,200);const source=new URL(f.args[f.args.indexOf('-i')+1]);
  assert.equal(source.searchParams.get('src'),'private_sd_alias');assert.equal(source.searchParams.has('audio'),false);
  assert.equal(f.args[f.args.indexOf('-t')+1],'5');assert.ok(f.args.includes('-an'));assert.ok(!f.args[f.args.indexOf('-fflags')+1].includes('nobuffer'));assert.equal(closes,1);
 }finally{await f.close();}
});
test('logout during SD preparation revokes the request and removes its temporary source',async()=>{
 let ready,release,closes=0;const started=new Promise(r=>ready=r),pending=new Promise(r=>release=r);
 const f=await fixture({async open(){ready();await pending;return{alias:'private_sd_alias',duration:5,async close(){closes++;}};}});
 try{
  const request=fetch(f.origin+'/api/replay/camera?at=100',{headers:f.headers});await started;
  const session=await(await fetch(f.origin+'/api/session',{headers:f.headers})).json();
  await fetch(f.origin+'/api/logout',{method:'POST',headers:{...f.headers,'X-CSRF-Token':session.csrf}});release();
  assert.equal((await request).status,401);assert.equal(closes,1);assert.equal(f.args,undefined);
 }finally{release();await f.close();}
});
test('background snapshots cannot reconnect a camera during its SD replay',async()=>{
 const f=await fixture({async open(){return{alias:'sd',duration:5,async close(){}};}},true);
 try{
  const replay=await fetch(f.origin+'/api/replay/camera?at=100',{headers:f.headers});
  const snapshot=await fetch(f.origin+'/api/snapshot/camera',{headers:f.headers});
  assert.equal(snapshot.status,503);assert.equal(f.spawns,1);await replay.body.cancel();
 }finally{await f.close();}
});
