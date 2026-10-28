import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createCentral} from '../server.mjs';
const app=createCentral(),port=await app.start(),origin='http://127.0.0.1:'+port;
// The NAS administrator retrieves this one-use invitation through File Station.
const login=await fetch(origin+'/api/session',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({code:app.bootstrap})});
if(login.ok){
 const headers={Origin:origin,Cookie:login.headers.get('set-cookie').split(';')[0]};
 const session=await(await fetch(origin+'/api/session',{headers})).json();
 try{
  const r=await fetch(origin+'/api/remote-link',{method:'POST',headers:{...headers,'X-CSRF-Token':session.csrf}});
  if(r.ok)writeFileSync(join(process.env.MIZIN_CAMERAS_TARGET,'runtime/central/owner-remote-access.json'),JSON.stringify(await r.json(),null,2),{mode:0o600});
 }finally{await fetch(origin+'/api/logout',{method:'POST',headers:{...headers,'X-CSRF-Token':session.csrf}});}
}
console.log('Central iniciada; convite administrativo disponível no diretório privado.');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await app.close();process.exit(0);});
