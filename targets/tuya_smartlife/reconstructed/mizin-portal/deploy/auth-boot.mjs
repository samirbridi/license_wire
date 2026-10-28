import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createCentral} from '../../../../xiaomi_home/reconstructed/mizin-cameras/server.mjs';
const app=createCentral({sdAdapter:false}),port=await app.start(),origin='http://127.0.0.1:'+port;
const login=await fetch(origin+'/api/session',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({code:app.bootstrap})});
if(!login.ok)throw new Error('Falha ao iniciar autenticação privada.');
const headers={Origin:origin,Cookie:login.headers.get('set-cookie').split(';')[0]};
const session=await(await fetch(origin+'/api/session',{headers})).json();headers['X-CSRF-Token']=session.csrf;
async function invite(){
 const reply=await fetch(origin+'/api/remote-link',{method:'POST',headers});
 if(!reply.ok)throw new Error('Convite administrativo não foi gerado.');
 writeFileSync(join(process.env.MIZIN_CAMERAS_TARGET,'runtime/central/owner-remote-access.json'),JSON.stringify(await reply.json(),null,2),{mode:0o600});
}
await invite();const renewal=setInterval(()=>invite().catch(()=>console.warn('Não foi possível renovar o convite.')),8*60_000);
console.log('Autenticação pronta; link administrativo na pasta privada do NAS.');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{clearInterval(renewal);await app.close();process.exit(0);});
