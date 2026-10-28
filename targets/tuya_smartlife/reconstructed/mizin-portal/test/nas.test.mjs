import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {createPortalGate,privateAuthFetch} from '../portal-gate.mjs';
import {createArchive} from '../camera-archive.mjs';
import {createCentral} from '../../../../xiaomi_home/reconstructed/mizin-cameras/server.mjs';
const origin='https://homecams.pages.dev',gatewayToken='test-gateway-secret';
const request=()=>({url:'/api/devices',method:'GET',headers:{host:'homecams.pages.dev','x-forwarded-proto':'https','x-mizin-gateway':gatewayToken,cookie:'example'}});
function response(){return{status:0,writeHead(code){this.status=code;},end(body){this.body=body;}};}
test('NAS portal rejects spoofed gateways before consulting authentication',async()=>{
 const gate=createPortalGate({origin,gatewayToken,fetcher:()=>assert.fail('Unexpected auth request')});const req=request();req.headers['x-mizin-gateway']='wrong';const res=response();assert.equal(await gate.protect(req,res),false);assert.equal(res.status,403);
});
test('NAS portal never authorizes an expired session or an unprotected command',async()=>{
 const denied=createPortalGate({origin,gatewayToken,fetcher:async()=>Response.json({},{status:401})});const res=response();assert.equal(await denied.protect(request(),res),false);assert.equal(res.status,401);
 const gate=createPortalGate({origin,gatewayToken,fetcher:async()=>Response.json({csrf:'owner-csrf'})});const req=request();assert.equal(await gate.protect(req,response()),true);req.method='POST';req.headers.origin=origin;assert.equal(await gate.protect(req,response()),false);req.headers['x-csrf-token']='owner-csrf';assert.equal(await gate.protect(req,response()),true);req.headers.origin='https://other.example';assert.equal(await gate.protect(req,response()),false);
});
test('archive quota includes old and incomplete files; invalid IDs cannot escape the NAS directory',async()=>{
 const root=await mkdtemp(join(tmpdir(),'mizin-archive-test-'));
 try{
  const archive=createArchive({root,aliases:['owned'],spawnProcess:()=>assert.fail('Unexpected recorder')});
  await writeFile(join(root,'old.mkv'),Buffer.alloc(70));await writeFile(join(root,'incomplete.partial.mkv'),Buffer.alloc(30));assert.equal(await archive.usage(),100);
  await assert.rejects(()=>archive.file('../../private'));await assert.rejects(()=>archive.record('unknown',10));await assert.rejects(()=>archive.record('owned',301));assert.deepEqual(await archive.list(),[]);
 }finally{const absolute=resolve(root);if(!absolute.startsWith(resolve(tmpdir())+sep)||!absolute.split(sep).at(-1).startsWith('mizin-archive-test-'))throw new Error('Unsafe test cleanup');await rm(absolute,{recursive:true,force:true});}
});
test('portal validates a real remote session through the authentication bridge',async()=>{
 const root=await mkdtemp(join(tmpdir(),'mizin-auth-test-'));const token='a'.repeat(40);
 const central=createCentral({runtime:root,cameras:[],port:0,remote:{origin,gatewayToken:token,port:0}});
 try{
  const port=await central.start(),local=`http://127.0.0.1:${port}`,remote=`http://127.0.0.1:${central.gatewayServer.address().port}`;
  const login=await fetch(local+'/api/session',{method:'POST',headers:{Origin:local,'Content-Type':'application/json'},body:JSON.stringify({code:central.bootstrap})});assert.equal(login.status,200);
  const owner={Origin:local,Cookie:login.headers.get('set-cookie').split(';')[0]};const session=await(await fetch(local+'/api/session',{headers:owner})).json();
  const invitation=await(await fetch(local+'/api/remote-link',{method:'POST',headers:{...owner,'X-CSRF-Token':session.csrf}})).json();
  const headers={host:'homecams.pages.dev',Origin:origin,'Content-Type':'application/json','x-forwarded-proto':'https','x-mizin-gateway':token};
  const connected=await privateAuthFetch(remote+'/api/session',{method:'POST',headers,body:JSON.stringify({code:new URLSearchParams(new URL(invitation.url).hash.slice(1)).get('pair')})});assert.equal(connected.status,200);assert.match(connected.headers.get('set-cookie'),/HttpOnly.*Secure/);
  const req=request();req.headers={...headers,cookie:connected.headers.get('set-cookie').split(';')[0]};
  const gate=createPortalGate({origin,gatewayToken:token,auth:remote});assert.equal(await gate.protect(req,response()),true);
  req.headers.cookie='invalid';assert.equal(await gate.protect(req,response()),false);
 }finally{await central.close();const absolute=resolve(root);if(!absolute.startsWith(resolve(tmpdir())+sep)||!absolute.split(sep).at(-1).startsWith('mizin-auth-test-'))throw new Error('Unsafe test cleanup');await rm(absolute,{recursive:true,force:true});}
});
