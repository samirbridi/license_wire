import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {execFileSync} from 'node:child_process';
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
test('continuous archive keeps one input and preserves every video packet across segments',{skip:!process.env.TEST_FFMPEG},async()=>{
 const root=await mkdtemp(join(tmpdir(),'mizin-segment-test-'));
 try{
  const ffmpeg=process.env.TEST_FFMPEG,ffprobe=ffmpeg.replace(/ffmpeg(?:\.exe)?$/,'ffprobe'+(process.platform==='win32'?'.exe':'')),input=join(root,'source.mkv'),output=join(root,'archive');
  execFileSync(ffmpeg,['-hide_banner','-nostdin','-loglevel','error','-f','lavfi','-i','testsrc2=size=320x180:rate=10','-f','lavfi','-i','sine=frequency=440:sample_rate=8000','-t','7','-c:v','libx264','-preset','ultrafast','-g','20','-c:a','pcm_s16le',input],{windowsHide:true});
  let inputs=0;const archive=createArchive({root:output,aliases:['owned'],ffmpeg,ffprobe,sourceFor:()=>{inputs++;return input;}});
  const result=await archive.continuous('owned',{segmentSeconds:2});assert.equal(inputs,1);assert.ok(result.segments>=3);
  const records=await archive.list();assert.equal(records.length,result.segments);let packets=0;
  for(const record of records){assert.equal(record.transcoded,false);const {file}=await archive.file(record.id);const probe=JSON.parse(execFileSync(ffprobe,['-v','error','-count_packets','-select_streams','v:0','-show_entries','stream=nb_read_packets','-of','json',file],{encoding:'utf8',windowsHide:true}));packets+=Number(probe.streams[0].nb_read_packets);assert.ok(record.streams.some(s=>s.type==='audio'));}
  assert.equal(packets,70);
 }finally{const absolute=resolve(root);if(!absolute.startsWith(resolve(tmpdir())+sep)||!absolute.split(sep).at(-1).startsWith('mizin-segment-test-'))throw new Error('Unsafe test cleanup');await rm(absolute,{recursive:true,force:true});}
});
test('quota tolerates a segment renamed during measurement but never ignores permission failures',async()=>{
 const root=await mkdtemp(join(tmpdir(),'mizin-quota-test-'));
 try{
  await writeFile(join(root,'finished.mkv'),Buffer.alloc(70));await writeFile(join(root,'renamed.partial.mkv'),Buffer.alloc(30));
  const archive=createArchive({root,aliases:[],statFile:file=>file.endsWith('renamed.partial.mkv')?Promise.reject(Object.assign(new Error('renamed'),{code:'ENOENT'})):stat(file)});
  assert.equal(await archive.usage(),70);
  const denied=createArchive({root,aliases:[],statFile:()=>Promise.reject(Object.assign(new Error('denied'),{code:'EACCES'}))});await assert.rejects(()=>denied.usage(),{code:'EACCES'});
 }finally{const absolute=resolve(root);if(!absolute.startsWith(resolve(tmpdir())+sep)||!absolute.split(sep).at(-1).startsWith('mizin-quota-test-'))throw new Error('Unsafe test cleanup');await rm(absolute,{recursive:true,force:true});}
});
