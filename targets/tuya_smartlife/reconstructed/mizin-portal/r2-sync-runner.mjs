import {readFile,writeFile,rename,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createDecipheriv} from 'node:crypto';
import {createArchiveIndex} from './archive-index.mjs';
import {createCloudStore,resolvePolicy} from './r2-store.mjs';
const directory=process.env.MIZIN_R2_SECRETS_ROOT,stateDirectory=process.env.MIZIN_R2_STATE_ROOT,root=process.env.MIZIN_ARCHIVE_ROOT;
if(!directory||!stateDirectory||!root)throw new Error('Pastas privadas de backup não configuradas.');await mkdir(stateDirectory,{recursive:true,mode:0o700});
const policy=resolvePolicy(),aliases=JSON.parse(await readFile(process.env.MIZIN_ARCHIVE_ALIASES,'utf8')),index=createArchiveIndex({root,aliases});let stopping=false,client=null,signature='',failures=0,failedConfig='';
for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{stopping=true;});
async function status(value){const file=join(stateDirectory,'r2-sync-status.json');await writeFile(file+'.tmp',JSON.stringify({...value,at:new Date().toISOString()},null,2),{mode:0o600});await rename(file+'.tmp',file);}
while(!stopping){try{
 let raw;try{raw=await readFile(join(directory,'config.json'),'utf8');}catch(e){if(e.code!=='ENOENT')throw e;await status({state:'awaiting_credentials'});}
 if(raw){const config=JSON.parse(raw);if(raw!==failedConfig){failures=0;failedConfig=raw;}if(!config.enabled)await status({state:'disabled'});else if(failures>=3)await status({state:'paused_error',message:'Três falhas consecutivas. Confira as credenciais e salve a configuração para tentar novamente.'});else{
  if(signature!==raw){const key=await readFile(join(directory,'key.bin')),[nonce,tag,data]=config.secretAccessKey.split('.').map(s=>Buffer.from(s,'base64url')),decipher=createDecipheriv('aes-256-gcm',key,nonce);decipher.setAuthTag(tag);config.secretAccessKey=Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8');client=await createCloudStore({directory:stateDirectory,config,policy});signature=raw;}
  // Oldest first: R2 extends the history the NAS will rotate away next.
  let count=0;for(const item of await index.entries(true)){if(stopping||count>=3)break;if(client.isKnown(item.record))continue;await status({state:'uploading',id:item.record.id,alias:item.record.alias,...client.status()});await client.synchronize(item.record,item.file);count++;failures=0;}await status({state:'ready',...client.status()});
 }}
}catch{failures++;await status({state:'error',failures,message:'Não foi possível sincronizar. Confira as credenciais, a rede e os limites do backup remoto.'});}
await new Promise(r=>setTimeout(r,15000));}
