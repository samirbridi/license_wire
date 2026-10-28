import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname,resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const target=resolve(dirname(fileURLToPath(import.meta.url)),'..'),runtime=join(target,'runtime/central');
const origin='http://127.0.0.1:19845';
const access=JSON.parse(readFileSync(join(runtime,'local-access.json'),'utf8'));
const code=new URLSearchParams(new URL(access.url).hash.slice(1)).get('pair');
const login=await fetch(origin+'/api/session',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({code})});
if(!login.ok)throw new Error('Fresh local pairing is required');
const headers={Cookie:login.headers.get('set-cookie').split(';')[0],Origin:origin};
const session=await(await fetch(origin+'/api/session',{headers})).json();
const out=join(target,'evidence/private','central-sd-'+Date.now());mkdirSync(out,{recursive:true});
const ffmpeg=JSON.parse(readFileSync(join(runtime,'tool-paths.json'),'utf8')).ffmpeg;
const results=[];
try{
 for(const [id,view,at] of [['outdoor_pro_poste','view1',1793102480],['outdoor_pro_poste','view2',1793102557],['aw300_garagem','main',1793102222],['mi2k_sala','main',1793102280]]){
  const cameras=await(await fetch(origin+'/api/cameras',{headers})).json(),camera=cameras.find(c=>c.id===id);
  const actualView=camera.views.length===1?camera.views[0].id:view;
  const response=await fetch(origin+`/api/clip/${id}?view=${actualView}&at=${at}&end=${at+5}&quality=original`,{headers,signal:AbortSignal.timeout(65000)});
  if(!response.ok){results.push({id,view,status:response.status});continue;}
  const data=Buffer.from(await response.arrayBuffer()),path=join(out,id+'-'+view+'.mp4');writeFileSync(path,data);
  const probe=spawnSync(join(dirname(ffmpeg),'ffprobe.exe'),['-v','error','-select_streams','v','-show_entries','stream=codec_name,width,height,nb_frames,duration','-of','json',path],{encoding:'utf8',windowsHide:true,timeout:15000});
  const media=JSON.parse(probe.stdout).streams?.[0];
  const decode=spawnSync(ffmpeg,['-hide_banner','-nostdin','-v','error','-ss','4','-i',path,'-frames:v','1',join(out,id+'-'+view+'-later.jpg')],{encoding:'utf8',windowsHide:true,timeout:15000});
  results.push({id,view,status:response.status,bytes:data.length,media,decodeExit:decode.status,attachment:response.headers.get('content-disposition')?.startsWith('attachment;')});
  console.log(JSON.stringify(results.at(-1)));
 }
}finally{
 await fetch(origin+'/api/local-link',{method:'POST',headers:{...headers,'X-CSRF-Token':session.csrf}});
 await fetch(origin+'/api/logout',{method:'POST',headers:{...headers,'X-CSRF-Token':session.csrf}});
 writeFileSync(join(out,'receipt.json'),JSON.stringify({date:new Date().toISOString(),results},null,2));
 console.log(JSON.stringify({privateFolder:out}));
}
