import {readFile,writeFile,mkdir,rename,statfs} from 'node:fs/promises';
import {join} from 'node:path';
import {createArchive} from './camera-archive.mjs';
const root=process.env.MIZIN_ARCHIVE_ROOT;
if(!root)throw new Error('Volume de gravações não configurado.');
const aliases=JSON.parse(await readFile(process.env.MIZIN_ARCHIVE_ALIASES,'utf8'));
if(!Array.isArray(aliases)||aliases.length>7||aliases.some(x=>!/^[a-z0-9_]{1,80}$/.test(x)))throw new Error('Inventário de gravações inválido.');
const archive=createArchive({root,aliases,ffmpeg:process.env.MIZIN_CAMERAS_FFMPEG||'ffmpeg',ffprobe:process.env.MIZIN_FFPROBE||'ffprobe'});
const rotating=process.env.MIZIN_ARCHIVE_ROTATE==='1',reserveBytes=Number(process.env.MIZIN_ARCHIVE_RESERVE_GB||50)*1024**3;
const status={startedAt:new Date().toISOString(),mode:'test',streams:{},limitBytes:Number(process.env.MIZIN_ARCHIVE_LIMIT_GB||750)*1024**3,overwrite:rotating,retention:{highWater:.92,lowWater:.85,reserveBytes}};
if(!Number.isFinite(status.limitBytes)||status.limitBytes<3*1024**3)throw new Error('Limite de gravação inválido.');
await mkdir(root,{recursive:true});let writing=Promise.resolve(),stopping=false;
const controller=new AbortController();
const wait=ms=>new Promise(done=>{const finish=()=>{clearTimeout(timer);controller.signal.removeEventListener('abort',finish);done();};const timer=setTimeout(finish,ms);if(controller.signal.aborted)finish();else controller.signal.addEventListener('abort',finish,{once:true});});
function save(){const snapshot=JSON.stringify(status,null,2);writing=writing.catch(()=>{}).then(async()=>{const file=join(root,'status.json');await writeFile(file+'.tmp',snapshot,{mode:0o600});await rename(file+'.tmp',file);});return writing;}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;status.mode='stopping';controller.abort();void save();});
let capacityAt=0,capacityValue=false,capacityJob=null;
async function capacity(){if(Date.now()-capacityAt<15000)return capacityValue;if(capacityJob)return capacityJob;capacityJob=(async()=>{if(rotating){const result=await archive.enforceRetention({maxBytes:status.limitBytes,reserveBytes});status.retention.lastCheck=new Date().toISOString();status.retention.lastDeleted=result.deleted.length;}const space=await statfs(root);capacityValue=await archive.usage()<status.limitBytes&&Number(space.bavail)*Number(space.bsize)>reserveBytes;capacityAt=Date.now();return capacityValue;})().finally(()=>{capacityJob=null;});return capacityJob;}
// Validate independently: one unavailable camera must not stop the other backups.
for(const alias of aliases)status.streams[alias]={state:'waiting'};
await save();
await archive.organizeLegacy();
await Promise.all(aliases.map(async(alias,index)=>{
 await wait(index*2000);let validated=false;
 while(!stopping){
  if(!await capacity()){status.streams[alias].state='paused_capacity';await save();await wait(30000);continue;}
  try{
   if(!validated){status.streams[alias].state='testing';await save();const record=await archive.record(alias,10);status.streams[alias]={state:'validated',lastRecording:record};validated=true;await save();}
   if(process.env.MIZIN_ARCHIVE_CONTINUOUS!=='1')return;
   status.mode='continuous';status.streams[alias].state='recording';await save();
   await archive.continuous(alias,{signal:controller.signal,canContinue:capacity,onProgress:async progress=>{status.streams[alias].lastFrameAt=progress.at;status.streams[alias].frames=progress.frame;await save();},onSegment:async record=>{status.streams[alias]={...status.streams[alias],state:'recording',lastRecording:record};await save();}});
  }catch{status.streams[alias]={...status.streams[alias],state:'retrying',error:'Fluxo interrompido; nova tentativa em 15 segundos.'};await save();if(!stopping)await wait(15000);}
 }
}));
if(!stopping){status.mode='test_complete';await save();}
