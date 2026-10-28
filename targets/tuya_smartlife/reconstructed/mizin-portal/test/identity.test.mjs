import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomBytes,createHash,generateKeyPairSync,sign} from 'node:crypto';
import * as OTPAuth from 'otpauth';
import {encodeCBOR} from '@levischuck/tiny-cbor';
import {createIdentity} from '../portal-identity.mjs';
import {createPortalGate,privateAuthFetch} from '../portal-gate.mjs';
const origin='https://homecams.pages.dev',gatewayToken='identity-tests-only-token',password='Fixture-Segura-2026-Xyz!',b64=b=>Buffer.from(b).toString('base64url');
async function fixture(fn){
 const directory=await mkdtemp(join(tmpdir(),'mizin-identity-test-'));let clock=Date.now();const app=await createIdentity({directory,origin,gatewayToken,port:0,now:()=>clock});const port=await app.start(),base='http://127.0.0.1:'+port;
 function client(){const cookies=new Map();let csrf='';return{get cookie(){return [...cookies].map(([k,v])=>k+'='+v).join('; ');},async call(path,body){const r=await privateAuthFetch(base+path,{method:body===undefined?'GET':'POST',headers:{host:'homecams.pages.dev',origin,'x-forwarded-proto':'https','x-mizin-gateway':gatewayToken,'x-csrf-token':csrf,'content-type':'application/json',cookie:this.cookie},body:body===undefined?undefined:JSON.stringify(body)});const cookie=r.headers.get('set-cookie');if(cookie){const[k,v]=cookie.split(';')[0].split('=');cookies.set(k,v);}const data=await r.json();if(data.csrf)csrf=data.csrf;return{status:r.status,data,headers:r.headers};}};}
 try{const owner=client();const root=await owner.call('/api/auth/setup',{token:app.setupToken,name:'Administrador Teste',username:'owner',email:'owner@example.test',password,remember:true});assert.equal(root.status,200);await fn({owner,client,directory,base,advance:ms=>clock+=ms,now:()=>clock});}
 finally{await app.close();const absolute=resolve(directory);if(!absolute.startsWith(resolve(tmpdir())+sep)||!absolute.split(sep).at(-1).startsWith('mizin-identity-test-'))throw new Error('Unsafe cleanup');await rm(absolute,{recursive:true,force:true});}
}
test('password login, persistent cookie, one owner and encrypted storage',()=>fixture(async({owner,client,directory})=>{
 const stranger=client();assert.equal((await stranger.call('/api/session')).status,401);
 assert.equal((await stranger.call('/api/auth/login',{login:'owner',password:'wrong'})).status,401);
 const r=await stranger.call('/api/auth/login',{login:'OWNER@example.test',password,remember:true});assert.equal(r.status,200);assert.match(r.headers.get('set-cookie'),/HttpOnly; Secure; SameSite=Strict/);assert.match(r.headers.get('set-cookie'),/Max-Age=2592000/);
 assert.equal((await owner.call('/api/auth/setup',{token:'anything'})).status,403);
 const db=await readFile(join(directory,'identity.json'),'utf8');assert.equal(db.includes(password),false);assert.match(db,/scrypt:/);
 await owner.call('/api/auth/sessions/revoke',{});assert.equal((await stranger.call('/api/session')).status,401);
}));
test('family can operate devices but cannot change settings or bypass a temporary password',()=>fixture(async({owner,client,base})=>{
 const created=await owner.call('/api/auth/admin/users/create',{name:'Família',username:'familia',email:'family@example.test'});assert.equal(created.status,200);
 const member=client();assert.equal((await member.call('/api/auth/login',{login:'familia',password:created.data.temporaryPassword})).status,200);
 const gate=createPortalGate({origin,gatewayToken,auth:base}),req={url:'/api/devices',method:'GET',headers:{host:'homecams.pages.dev','x-forwarded-proto':'https','x-mizin-gateway':gatewayToken,cookie:member.cookie,origin}},res=()=>({status:0,writeHead(n){this.status=n;},end(){}});
 const first=res();assert.equal(await gate.protect(req,first),false);assert.equal(first.status,403);
 assert.equal((await member.call('/api/auth/password',{currentPassword:created.data.temporaryPassword,password:'Familia-Segura-2026!'})).status,200);
 const session=(await member.call('/api/session')).data;req.headers['x-csrf-token']=session.csrf;
 assert.equal(await gate.protect(req,res()),true);req.method='POST';req.url='/api/gate/pulse';assert.equal(await gate.protect(req,res()),true);
 for(const url of ['/api/system/restore','/api/config/ui','/api/scenes','/api/automations/abc/toggle']){req.url=url;const r=res();assert.equal(await gate.protect(req,r),false);assert.equal(r.status,403);}
 req.method='GET';req.url='/api/system/backup';assert.equal(await gate.protect(req,res()),false);
 assert.equal((await member.call('/api/auth/admin/users')).status,403);assert.equal((await member.call('/api/auth/admin/users/create',{name:'Intruso'})).status,403);
 assert.equal((await owner.call('/api/auth/admin/users/update',{userId:(await owner.call('/api/session')).data.user.id,name:'Owner',username:'owner',email:'owner@example.test',role:'member'})).status,400);
}));
test('TOTP requires confirmation, rejects replay and supports single-use recovery',()=>fixture(async({owner,client,directory,advance,now})=>{
 const setup=await owner.call('/api/auth/totp/setup',{});assert.equal(setup.status,200);assert.match(setup.data.qr,/^data:image\/png;base64,/);
 let db=await readFile(join(directory,'identity.json'),'utf8');assert.equal(db.includes(setup.data.secret),false);
 const totp=new OTPAuth.TOTP({secret:OTPAuth.Secret.fromBase32(setup.data.secret)});
 const enabled=await owner.call('/api/auth/totp/confirm',{code:totp.generate({timestamp:now()})});assert.equal(enabled.status,200);assert.equal(enabled.data.codes.length,10);
 const guest=client(),a=await guest.call('/api/auth/login',{login:'owner',password});assert.equal(a.data.requiresTotp,true);assert.equal((await guest.call('/api/session')).status,401);
 assert.equal((await guest.call('/api/auth/login/totp',{challengeId:a.data.challengeId,code:totp.generate({timestamp:now()})})).status,401);
 advance(31000);const b=await guest.call('/api/auth/login',{login:'owner',password});assert.equal((await guest.call('/api/auth/login/totp',{challengeId:b.data.challengeId,code:totp.generate({timestamp:now()})})).status,200);
 const recovery=client(),c=await recovery.call('/api/auth/login',{login:'owner',password});assert.equal((await recovery.call('/api/auth/login/totp',{challengeId:c.data.challengeId,code:enabled.data.codes[0]})).status,200);
 const d=await recovery.call('/api/auth/login',{login:'owner',password});assert.equal((await recovery.call('/api/auth/login/totp',{challengeId:d.data.challengeId,code:enabled.data.codes[0]})).status,401);
}));
test('real WebAuthn signature verification accepts a valid passkey and rejects origin tampering',()=>fixture(async({owner,client})=>{
 const keys=generateKeyPairSync('ec',{namedCurve:'prime256v1'}),jwk=keys.publicKey.export({format:'jwk'}),credentialId=randomBytes(32);
 const cose=encodeCBOR(new Map([[1,2],[3,-7],[-1,1],[-2,new Uint8Array(Buffer.from(jwk.x,'base64url'))],[-3,new Uint8Array(Buffer.from(jwk.y,'base64url'))]]));
 const options=await owner.call('/api/auth/passkeys/register/options',{});assert.equal(options.status,200);
 const flags=Buffer.from([0x45]),counter=Buffer.alloc(4),length=Buffer.alloc(2);length.writeUInt16BE(credentialId.length);
 const rpHash=createHash('sha256').update('homecams.pages.dev').digest(),authData=Buffer.concat([rpHash,flags,counter,Buffer.alloc(16),length,credentialId,Buffer.from(cose)]);
 const registration={id:b64(credentialId),rawId:b64(credentialId),type:'public-key',clientExtensionResults:{},response:{clientDataJSON:b64(JSON.stringify({type:'webauthn.create',challenge:options.data.options.challenge,origin,crossOrigin:false})),attestationObject:b64(encodeCBOR(new Map([['fmt','none'],['attStmt',new Map()],['authData',new Uint8Array(authData)]]))),transports:['internal']}};
 const registered=await owner.call('/api/auth/passkeys/register/verify',{challengeId:options.data.challengeId,response:registration});assert.equal(registered.status,200,JSON.stringify(registered.data));
 const stranger=client();async function authenticate(originValue,count){const o=await stranger.call('/api/auth/passkeys/login/options',{remember:false}),counter=Buffer.alloc(4);counter.writeUInt32BE(count);const data=Buffer.concat([rpHash,Buffer.from([5]),counter]),clientData=Buffer.from(JSON.stringify({type:'webauthn.get',challenge:o.data.options.challenge,origin:originValue,crossOrigin:false})),signature=sign('sha256',Buffer.concat([data,createHash('sha256').update(clientData).digest()]),keys.privateKey);return stranger.call('/api/auth/passkeys/login/verify',{challengeId:o.data.challengeId,response:{id:b64(credentialId),rawId:b64(credentialId),type:'public-key',clientExtensionResults:{},response:{clientDataJSON:b64(clientData),authenticatorData:b64(data),signature:b64(signature),userHandle:options.data.options.user.id}}});}
 assert.equal((await authenticate(origin,1)).status,200);assert.equal((await authenticate('https://attacker.example',2)).status,400);
}));
test('forgot password does not reveal accounts and reset revokes existing sessions',()=>fixture(async({owner,client})=>{
 const created=await owner.call('/api/auth/admin/users/create',{name:'Visitante',username:'visitor',email:'visitor@example.test'}),visitor=client();await visitor.call('/api/auth/login',{login:'visitor',password:created.data.temporaryPassword});
 const a=await visitor.call('/api/auth/forgot',{login:'visitor'}),b=await visitor.call('/api/auth/forgot',{login:'nonexistent'});assert.deepEqual(a,b);
 const users=await owner.call('/api/auth/admin/users');assert.equal(users.data.requests.filter(x=>x.status==='pending').length,1);
 const reset=await owner.call('/api/auth/admin/users/reset-password',{userId:created.data.user.id});assert.equal(reset.status,200);assert.equal((await visitor.call('/api/session')).status,401);
 assert.equal((await visitor.call('/api/auth/login',{login:'visitor',password:created.data.temporaryPassword})).status,401);
}));
