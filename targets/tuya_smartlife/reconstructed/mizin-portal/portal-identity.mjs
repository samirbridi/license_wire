import http from 'node:http';
import {randomBytes,createHash,timingSafeEqual,scrypt as scryptCallback,createCipheriv,createDecipheriv} from 'node:crypto';
import {promisify} from 'node:util';
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {join} from 'node:path';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import {generateRegistrationOptions,verifyRegistrationResponse,generateAuthenticationOptions,verifyAuthenticationResponse} from '@simplewebauthn/server';
import {cloudPolicy,validateCloudConfig,createCloudStore,createS3,monthlyCeilingEstimate} from './r2-store.mjs';
import {ListObjectsV2Command} from '@aws-sdk/client-s3';

const scrypt=promisify(scryptCallback),random=()=>randomBytes(32).toString('base64url'),sha=x=>createHash('sha256').update(x).digest('hex');
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
const problem=(status,message)=>Object.assign(new Error(message),{status});
const normalized=x=>String(x||'').trim().toLowerCase();
export async function passwordHash(password){
 if(typeof password!=='string'||password.length<12||password.length>128||/^(password|senha|1234567890)/i.test(password))throw problem(400,'Use uma senha de 12 a 128 caracteres, sem sequências comuns.');
 const salt=randomBytes(16).toString('hex');return `scrypt:${salt}:${Buffer.from(await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024**2})).toString('hex')}`;
}
async function passwordMatches(value,stored){
 const [,salt,hash]=String(stored).split(':');if(!salt||!hash||typeof value!=='string'||value.length>128)return false;
 return same(Buffer.from(await scrypt(value,salt,64,{N:32768,r:8,p:1,maxmem:64*1024**2})).toString('hex'),hash);
}
const publicUser=u=>({id:u.id,name:u.name,username:u.username,email:u.email,role:u.role,disabled:!!u.disabled,mustChangePassword:!!u.mustChangePassword,totpEnabled:!!u.totp,passkeys:(u.passkeys||[]).map(p=>({id:p.id,name:p.name,createdAt:p.createdAt,backedUp:p.backedUp})),recoveryCodesRemaining:(u.recoveryCodes||[]).length,createdAt:u.createdAt});
export async function createIdentity({directory,origin='https://homecams.pages.dev',gatewayToken,port=19846,now=()=>Date.now(),webauthn={generateRegistrationOptions,verifyRegistrationResponse,generateAuthenticationOptions,verifyAuthenticationResponse}}){
 const rpID=new URL(origin).hostname;await mkdir(directory,{recursive:true,mode:0o700});
 async function load(file,fallback){try{return JSON.parse(await readFile(join(directory,file),'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
 async function atomic(file,value){const target=join(directory,file),temp=target+'.'+random()+'.tmp';await writeFile(temp,JSON.stringify(value,null,2),{mode:0o600});await rename(temp,target);}
 const db=await load('identity.json',{schema:1,users:[],sessions:{},requests:[],audit:[]});
 let key;try{key=await readFile(join(directory,'identity.key'));}catch(e){if(e.code!=='ENOENT')throw e;key=randomBytes(32);await writeFile(join(directory,'identity.key'),key,{flag:'wx',mode:0o600});}
 if(key.length!==32)throw new Error('Chave de identidade inválida.');
 function seal(secret,vaultKey=key){const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',vaultKey,nonce),data=Buffer.concat([cipher.update(secret,'utf8'),cipher.final()]);return [nonce,cipher.getAuthTag(),data].map(b=>b.toString('base64url')).join('.');}
 function unseal(value,vaultKey=key){const [nonce,tag,data]=value.split('.').map(s=>Buffer.from(s,'base64url')),decipher=createDecipheriv('aes-256-gcm',vaultKey,nonce);decipher.setAuthTag(tag);return Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8');}
 await mkdir(join(directory,'cloud-secrets'),{recursive:true,mode:0o700});await mkdir(join(directory,'cloud-state'),{recursive:true,mode:0o700});let cloudKey;try{cloudKey=await readFile(join(directory,'cloud-secrets/key.bin'));}catch(e){if(e.code!=='ENOENT')throw e;cloudKey=randomBytes(32);await writeFile(join(directory,'cloud-secrets/key.bin'),cloudKey,{flag:'wx',mode:0o600});}
 async function cloud(){const config=await load('cloud-secrets/config.json',null);return config?createCloudStore({directory:join(directory,'cloud-state'),config:{...config,secretAccessKey:unseal(config.secretAccessKey,cloudKey)}}):null;}
 let queue=Promise.resolve();function persist(){const snapshot=JSON.parse(JSON.stringify(db));queue=queue.catch(()=>{}).then(()=>atomic('identity.json',snapshot));return queue;}
 function audit(actor,action,target){db.audit.push({at:new Date(now()).toISOString(),actor,action,target});db.audit=db.audit.slice(-1000);}
 const setupToken=random();if(!db.users.length)await atomic('owner-setup.json',{url:origin+'/#setup='+setupToken,expiresAt:new Date(now()+24*3600_000).toISOString()});
 const setupExpiry=now()+24*3600_000,challenges=new Map(),attempts=new Map();let sensitive=Promise.resolve();
 const dummy=await passwordHash(random());
 function throttle(req,identity=''){const client=req.headers['x-mizin-client-ip']||req.socket.remoteAddress;for(const id of [String(client),...(identity?[normalized(identity)]:[])]){const k=sha(id),entry=attempts.get(k)||{at:now(),count:0};if(now()-entry.at>900_000){entry.at=now();entry.count=0;}if(++entry.count>12)throw problem(429,'Aguarde alguns minutos antes de tentar novamente.');attempts.set(k,entry);}if(attempts.size>5000)for(const [k,v]of attempts)if(now()-v.at>900_000)attempts.delete(k);}
 const cookie=(req,name)=>new RegExp('(?:^|;\\s*)'+name+'=([A-Za-z0-9_-]{40,80})(?:;|$)').exec(req.headers.cookie||'')?.[1];
 function session(req){const token=cookie(req,'mizin_home'),entry=token&&db.sessions[sha(token)],u=entry&&db.users.find(u=>u.id===entry.userId);return entry&&entry.expires>now()&&u&&!u.disabled?{...entry,user:u,key:sha(token)}:null;}
 function csrf(req,s){if(req.headers.origin!==origin||!same(req.headers['x-csrf-token'],s.csrf))throw problem(403,'Requisição não autorizada.');}
 function requireUser(req){const s=session(req);if(!s)throw problem(401,'Entre com sua conta.');csrf(req,s);return s;}
 async function recent(req,s,body){if(now()-s.authAt<600_000)return;if(!await passwordMatches(body.currentPassword,s.user.password))throw problem(401,'Confirme a senha atual para alterar a segurança.');if(s.user.totp)verifyFactor(s.user,body.totp||body.recoveryCode);db.sessions[s.key].authAt=now();}
 function revoke(userId,except){for(const[k,s]of Object.entries(db.sessions))if(s.userId===userId&&k!==except)delete db.sessions[k];}
 function setCookie(res,name,value,maxAge){res.setHeader('Set-Cookie',`${name}=${value}; HttpOnly; Secure; SameSite=Strict; Path=/${maxAge===undefined?'':'; Max-Age='+maxAge}`);}
 async function establish(res,u,remember){const token=random(),entry={userId:u.id,csrf:random(),authAt:now(),createdAt:now(),expires:now()+(remember?30*86400_000:8*3600_000)};db.sessions[sha(token)]=entry;for(const[k,s]of Object.entries(db.sessions))if(s.expires<=now())delete db.sessions[k];setCookie(res,'mizin_home',token,remember?30*86400:undefined);audit(u.id,'login',u.id);await persist();return{csrf:entry.csrf,user:publicUser(u)};}
 function newChallenge(req,res,value){const pre=random(),id=random();setCookie(res,'mizin_pre',pre,300);challenges.set(id,{...value,browser:sha(pre),expires:now()+300_000});for(const[k,v]of challenges)if(v.expires<=now())challenges.delete(k);return id;}
 function consume(req,id,type){const c=challenges.get(id);challenges.delete(id);if(!c||c.type!==type||c.expires<=now()||!same(c.browser,sha(cookie(req,'mizin_pre')||'')))throw problem(401,'A solicitação expirou. Tente novamente.');return c;}
 function verifyFactor(u,token){
  const code=String(token||'').trim().replaceAll('-','').toUpperCase(),hash=sha(code);
  if((u.recoveryCodes||[]).includes(hash)){u.recoveryCodes=u.recoveryCodes.filter(x=>x!==hash);return;}
  if(!u.totp||!/^\d{6}$/.test(code))throw problem(401,'Código de autenticação inválido.');
  const totp=new OTPAuth.TOTP({secret:OTPAuth.Secret.fromBase32(unseal(u.totp)),digits:6,period:30}),delta=totp.validate({token:code,timestamp:now(),window:1}),counter=Math.floor(now()/30000)+(delta??0);
  if(delta===null||counter<=(u.lastTotpCounter??-1))throw problem(401,'Código inválido ou já utilizado.');u.lastTotpCounter=counter;
 }
 function recovery(u){const codes=Array.from({length:10},()=>randomBytes(10).toString('hex').toUpperCase());u.recoveryCodes=codes.map(sha);return codes;}
 function fields(body){const username=normalized(body.username),email=normalized(body.email),name=String(body.name||'').trim();if(!/^[a-z0-9_.-]{3,40}$/.test(username)||!/^\S+@\S+\.\S+$/.test(email)||email.length>254||name.length<2||name.length>80)throw problem(400,'Confira nome, usuário e e-mail.');return{username,email,name};}
 function unique(f,except){if(db.users.some(u=>u.id!==except&&[u.username,u.email].some(x=>[f.username,f.email].includes(x))))throw problem(409,'Usuário ou e-mail já cadastrado.');}
 async function jsonBody(req){let text='';for await(const c of req){text+=c;if(Buffer.byteLength(text)>32768)throw problem(413,'Requisição muito grande.');}try{return text?JSON.parse(text):{};}catch{throw problem(400,'Dados inválidos.');}}
 function send(res,status,value){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value));}
 async function dispatch(req,res){
  if(req.headers.host!==new URL(origin).host||req.headers['x-forwarded-proto']!=='https'||!same(req.headers['x-mizin-gateway'],gatewayToken))throw problem(403,'Passagem privada não autorizada.');
  const path=new URL(req.url,origin).pathname,method=req.method,s=session(req);
  if(method==='GET'&&path==='/api/session'){if(!s)throw problem(401,'Entre com sua conta.');return send(res,200,{csrf:s.csrf,user:publicUser(s.user)});}
  if(method==='GET'&&path==='/api/auth/status')return send(res,200,{setupRequired:db.users.length===0,passkeys:true});
  if(method==='GET'&&path==='/api/auth/profile'){if(!s)throw problem(401,'Entre com sua conta.');return send(res,200,{user:publicUser(s.user)});}
  if(method==='GET'&&path==='/api/auth/admin/users'){if(s?.user.role!=='admin')throw problem(s?403:401,'Acesso reservado ao administrador.');return send(res,200,{users:db.users.map(publicUser),requests:db.requests,audit:db.audit.slice(-100)});}
  if(method==='GET'&&path==='/api/auth/admin/storage'){if(s?.user.role!=='admin')throw problem(s?403:401,'Acesso reservado ao administrador.');const config=await load('cloud-secrets/config.json',null);return send(res,200,{configured:!!config,enabled:!!config?.enabled,accountId:config?.accountId||'',bucket:cloudPolicy.bucket,policy:cloudPolicy,estimate:monthlyCeilingEstimate(),sync:await load('cloud-state/r2-sync-status.json',{state:'awaiting_credentials'})});}
  if(method==='GET'&&path==='/api/auth/cloud/catalog'){if(!s||s.user.mustChangePassword)throw problem(401,'Entre com sua conta.');const state=await load('cloud-state/r2-state.json',{records:[]}),query=new URL(req.url,origin).searchParams,day=query.get('day'),offset=Math.max(0,Math.min(100000,Number(query.get('offset'))||0));let records=[...state.records].reverse();if(day&&/^\d{4}-\d{2}-\d{2}$/.test(day))records=records.filter(x=>new Date(x.startedAt).toLocaleDateString('en-CA',{timeZone:'America/Sao_Paulo'})===day);return send(res,200,{total:records.length,records:records.slice(offset,offset+200)});}
  if(method==='GET'&&path==='/api/auth/cloud/download'){if(!s||s.user.mustChangePassword)throw problem(401,'Entre com sua conta.');const client=await cloud();if(!client)throw problem(409,'Backup remoto ainda não configurado.');return send(res,200,await client.signedDownload(new URL(req.url,origin).searchParams.get('id')));}
  if(method!=='POST')throw problem(404,'Recurso indisponível.');
  if(req.headers.origin!==origin)throw problem(403,'Origem não autorizada.');const body=await jsonBody(req);
  if(path==='/api/auth/setup'){
   throttle(req);if(db.users.length||now()>setupExpiry||!same(body.token,setupToken))throw problem(403,'Use o link privado de configuração do NAS.');
   const f=fields(body),u={id:random(),...f,role:'admin',password:await passwordHash(body.password),createdAt:new Date(now()).toISOString(),passkeys:[]};
   if(db.users.length)throw problem(409,'O administrador já foi cadastrado.');db.users.push(u);audit(u.id,'owner-created',u.id);return send(res,200,await establish(res,u,!!body.remember));
  }
  if(path==='/api/auth/login'){
   throttle(req,body.login);const u=db.users.find(u=>[u.username,u.email].includes(normalized(body.login))),ok=await passwordMatches(body.password,u?.password||dummy);
   if(!u||u.disabled||!ok)throw problem(401,'Usuário ou senha inválidos.');
   if(u.totp){const challengeId=newChallenge(req,res,{type:'totp-login',userId:u.id,remember:!!body.remember});return send(res,200,{requiresTotp:true,challengeId});}
   return send(res,200,await establish(res,u,!!body.remember));
  }
  if(path==='/api/auth/login/totp'){throttle(req);const c=consume(req,body.challengeId,'totp-login'),u=db.users.find(u=>u.id===c.userId);if(!u||u.disabled)throw problem(401,'Conta indisponível.');verifyFactor(u,body.code);return send(res,200,await establish(res,u,c.remember));}
  if(path==='/api/auth/forgot'){throttle(req,body.login);const u=db.users.find(u=>[u.username,u.email].includes(normalized(body.login)));if(u&&!db.requests.some(r=>r.userId===u.id&&r.status==='pending')){db.requests.push({id:random(),userId:u.id,at:new Date(now()).toISOString(),status:'pending'});db.requests=db.requests.slice(-100);await persist();}return send(res,200,{message:'Se a conta estiver cadastrada, o pedido ficará disponível ao administrador.'});}
  if(path==='/api/auth/passkeys/login/options'){throttle(req);const options=await webauthn.generateAuthenticationOptions({rpID,userVerification:'required'}),challengeId=newChallenge(req,res,{type:'passkey-login',challenge:options.challenge,remember:!!body.remember});return send(res,200,{options,challengeId});}
  if(path==='/api/auth/passkeys/login/verify'){
   throttle(req);const c=consume(req,body.challengeId,'passkey-login'),u=db.users.find(u=>(u.passkeys||[]).some(p=>p.id===body.response?.id)),p=u?.passkeys.find(p=>p.id===body.response?.id);
   if(!p||u.disabled)throw problem(401,'Passkey não reconhecida.');const result=await webauthn.verifyAuthenticationResponse({response:body.response,expectedChallenge:c.challenge,expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true,credential:{...p,publicKey:new Uint8Array(Buffer.from(p.publicKey,'base64url'))}});
   if(!result.verified)throw problem(401,'Passkey não confirmada.');p.counter=result.authenticationInfo.newCounter;return send(res,200,await establish(res,u,c.remember));
  }
  const current=requireUser(req),u=current.user;
  if(path==='/api/logout'){delete db.sessions[current.key];await persist();setCookie(res,'mizin_home','',0);return send(res,200,{ok:true});}
  if(u.mustChangePassword&&path!=='/api/auth/password')throw problem(403,'Defina uma nova senha antes de continuar.');
  if(path==='/api/auth/profile'){await recent(req,current,body);const f=fields(body);unique(f,u.id);Object.assign(u,f);audit(u.id,'profile-updated',u.id);await persist();return send(res,200,{user:publicUser(u)});}
  if(path==='/api/auth/password'){if(!await passwordMatches(body.currentPassword,u.password))throw problem(401,'Senha atual inválida.');if(u.totp&&now()-current.authAt>=600_000)verifyFactor(u,body.totp);u.password=await passwordHash(body.password);u.mustChangePassword=false;revoke(u.id,current.key);db.sessions[current.key].authAt=now();audit(u.id,'password-changed',u.id);await persist();return send(res,200,{ok:true});}
  if(path==='/api/auth/sessions/revoke'){await recent(req,current,body);revoke(u.id,current.key);await persist();return send(res,200,{ok:true});}
  if(path==='/api/auth/totp/setup'){await recent(req,current,body);if(u.totp)throw problem(409,'O autenticador já está ativo.');const secret=new OTPAuth.Secret({size:20}).base32,totp=new OTPAuth.TOTP({issuer:'Mizin Home',label:u.email,secret:OTPAuth.Secret.fromBase32(secret)});u.pendingTotp={secret:seal(secret),expires:now()+600_000};await persist();return send(res,200,{secret,qr:await QRCode.toDataURL(totp.toString(),{width:280,margin:2})});}
  if(path==='/api/auth/totp/confirm'){if(!u.pendingTotp||u.pendingTotp.expires<now())throw problem(400,'Configure o autenticador novamente.');const trial={...u,totp:u.pendingTotp.secret,lastTotpCounter:-1};verifyFactor(trial,body.code);u.totp=trial.totp;u.lastTotpCounter=trial.lastTotpCounter;delete u.pendingTotp;const codes=recovery(u);revoke(u.id,current.key);audit(u.id,'totp-enabled',u.id);await persist();return send(res,200,{codes,user:publicUser(u)});}
  if(path==='/api/auth/totp/disable'){if(now()-current.authAt>=600_000&&!await passwordMatches(body.currentPassword,u.password))throw problem(401,'Confirme sua senha atual.');verifyFactor(u,body.code);delete u.totp;delete u.lastTotpCounter;u.recoveryCodes=[];revoke(u.id,current.key);audit(u.id,'totp-disabled',u.id);await persist();return send(res,200,{user:publicUser(u)});}
  if(path==='/api/auth/passkeys/register/options'){await recent(req,current,body);const options=await webauthn.generateRegistrationOptions({rpName:'Mizin Home',rpID,userID:Buffer.from(u.id,'base64url'),userName:u.username,userDisplayName:u.name,attestationType:'none',excludeCredentials:u.passkeys.map(p=>({id:p.id,transports:p.transports})),authenticatorSelection:{residentKey:'required',userVerification:'required'}}),challengeId=newChallenge(req,res,{type:'passkey-register',userId:u.id,challenge:options.challenge,name:String(body.name||'Minha passkey').slice(0,60)});return send(res,200,{options,challengeId});}
  if(path==='/api/auth/passkeys/register/verify'){const c=consume(req,body.challengeId,'passkey-register');if(c.userId!==u.id)throw problem(403,'Conta não autorizada.');const result=await webauthn.verifyRegistrationResponse({response:body.response,expectedChallenge:c.challenge,expectedOrigin:origin,expectedRPID:rpID,requireUserVerification:true});if(!result.verified)throw problem(401,'Passkey não confirmada.');const info=result.registrationInfo,p=info.credential;if(db.users.some(x=>x.passkeys.some(k=>k.id===p.id)))throw problem(409,'Passkey já cadastrada.');u.passkeys.push({id:p.id,publicKey:Buffer.from(p.publicKey).toString('base64url'),counter:p.counter,transports:body.response.response?.transports||[],name:c.name,backedUp:info.credentialBackedUp,createdAt:new Date(now()).toISOString()});audit(u.id,'passkey-created',u.id);await persist();return send(res,200,{user:publicUser(u)});}
  if(path==='/api/auth/passkeys/remove'){await recent(req,current,body);u.passkeys=u.passkeys.filter(p=>p.id!==body.id);revoke(u.id,current.key);audit(u.id,'passkey-removed',u.id);await persist();return send(res,200,{user:publicUser(u)});}
  if(path.startsWith('/api/auth/admin/')){
   if(u.role!=='admin')throw problem(403,'Acesso reservado ao administrador.');await recent(req,current,body);
   if(path==='/api/auth/admin/storage'){
    const previous=await load('cloud-secrets/config.json',null),secretAccessKey=body.secretAccessKey||(previous?unseal(previous.secretAccessKey,cloudKey):'');let config;try{config=validateCloudConfig({...previous,...body,accessKeyId:body.accessKeyId||previous?.accessKeyId,bucket:cloudPolicy.bucket,secretAccessKey});}catch(e){throw problem(400,e.message);}
    if(config.enabled){const client=createS3(config);try{await client.send(new ListObjectsV2Command({Bucket:config.bucket,MaxKeys:1}),{abortSignal:AbortSignal.timeout(3000)});}catch{throw problem(400,'Não foi possível validar o acesso S3 ao bucket privado. Confira as chaves e permissões.');}finally{client.destroy();}}
    await atomic('cloud-secrets/config.json',{...config,secretAccessKey:seal(config.secretAccessKey,cloudKey),updatedAt:new Date(now()).toISOString()});audit(u.id,'cloud-storage-configured',cloudPolicy.bucket);await persist();return send(res,200,{ok:true,policy:cloudPolicy});
   }
   if(path==='/api/auth/admin/users/create'){const f=fields(body);unique(f);const temporaryPassword=random().slice(0,24),target={id:random(),...f,role:body.role==='admin'?'admin':'member',password:await passwordHash(temporaryPassword),mustChangePassword:true,passkeys:[],createdAt:new Date(now()).toISOString()};db.users.push(target);audit(u.id,'user-created',target.id);await persist();return send(res,200,{user:publicUser(target),temporaryPassword});}
   const target=db.users.find(x=>x.id===body.userId);if(!target)throw problem(404,'Usuário não encontrado.');
   if(path==='/api/auth/admin/users/reset-password'){if(target.id===u.id)throw problem(400,'Altere sua senha pelo formulário da própria conta.');const temporaryPassword=random().slice(0,24);target.password=await passwordHash(temporaryPassword);target.mustChangePassword=true;revoke(target.id);for(const r of db.requests)if(r.userId===target.id)r.status='resolved';audit(u.id,'password-reset',target.id);await persist();return send(res,200,{temporaryPassword});}
   if(path==='/api/auth/admin/users/update'){if(target.id===u.id&&(body.disabled||body.role==='member'))throw problem(400,'Não remova o próprio acesso de administrador.');if(target.role==='admin'&&(body.disabled||body.role==='member')&&db.users.filter(x=>x.role==='admin'&&!x.disabled).length<=1)throw problem(400,'Mantenha ao menos um administrador ativo.');const f=fields(body);unique(f,target.id);Object.assign(target,f,{role:body.role==='admin'?'admin':'member',disabled:!!body.disabled});revoke(target.id);audit(u.id,'user-updated',target.id);await persist();return send(res,200,{user:publicUser(target)});}
   if(path==='/api/auth/admin/users/reset-mfa'){if(target.id===u.id)throw problem(400,'Use seus códigos de recuperação para a própria conta.');delete target.totp;delete target.pendingTotp;target.passkeys=[];target.recoveryCodes=[];revoke(target.id);audit(u.id,'mfa-reset',target.id);await persist();return send(res,200,{ok:true});}
  }
  throw problem(404,'Recurso indisponível.');
 }
 let pending=0;
 const server=http.createServer((req,res)=>{
  if(pending>=32){send(res,503,{error:'A autenticação está ocupada. Tente novamente.'});return;}pending++;req.setTimeout(15000,()=>req.destroy());
  // Serialize identity mutations, including code consumption and password resets.
  const task=()=>dispatch(req,res).catch(e=>{if(!res.destroyed)send(res,e.status||400,{error:e.status?e.message:'Não foi possível concluir a autenticação.'});}).finally(()=>pending--);
  sensitive=sensitive.catch(()=>{}).then(task);
 });
 return{server,setupToken,start:()=>new Promise(resolve=>server.listen(port,'127.0.0.1',()=>resolve(server.address().port))),close:async()=>{await sensitive;await queue;await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});}};
}
