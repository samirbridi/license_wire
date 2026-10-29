import {readFile,writeFile,mkdir,rename,statfs} from 'node:fs/promises';
import {join} from 'node:path';
import {createArchive} from './camera-archive.mjs';
import {cameraName} from './archive-index.mjs';
const root=process.env.MIZIN_ARCHIVE_ROOT;
if(!root)throw new Error('Volume de gravações não configurado.');
const aliases=JSON.parse(await readFile(process.env.MIZIN_ARCHIVE_ALIASES,'utf8'));
if(!Array.isArray(aliases)||aliases.length>7||aliases.some(x=>!/^[a-z0-9_]{1,80}$/.test(x)))throw new Error('Inventário de gravações inválido.');
const archive=createArchive({root,aliases,ffmpeg:process.env.MIZIN_CAMERAS_FFMPEG||'ffmpeg',ffprobe:process.env.MIZIN_FFPROBE||'ffprobe'});
// No fixed quota by default: the volume is used until highWater and the oldest recordings rotate out.
// MIZIN_ARCHIVE_LIMIT_GB>0 still caps the camera folder when the volume is shared with other data.
const rotating=process.env.MIZIN_ARCHIVE_ROTATE!=='0',reserveBytes=Number(process.env.MIZIN_ARCHIVE_RESERVE_GB||50)*1024**3,limitBytes=Number(process.env.MIZIN_ARCHIVE_LIMIT_GB||0)*1024**3;
const segmentSeconds=Math.round(Number(process.env.MIZIN_ARCHIVE_SEGMENT_MINUTES||15)*60),requireBackup=process.env.MIZIN_ARCHIVE_REQUIRE_BACKUP==='1',cloudState=process.env.MIZIN_R2_STATE_ROOT;
const policy={highWater:Number(process.env.MIZIN_ARCHIVE_HIGH_WATER||.9),lowWater:Number(process.env.MIZIN_ARCHIVE_LOW_WATER||.85),reserveBytes,requireBackup};
if(!Number.isFinite(limitBytes)||limitBytes<0||limitBytes>0&&limitBytes<3*1024**3)throw new Error('Limite de gravação inválido.');
if(!Number.isInteger(segmentSeconds)||segmentSeconds<60||segmentSeconds>3600)throw new Error('Duração de segmento inválida.');
const status={startedAt:new Date().toISOString(),mode:'test',streams:{},layout:'camera/AAAA-MM-DD/HH-MM-SS.mkv',segmentSeconds,limitBytes,overwrite:rotating,retention:{...policy,preferBackedUp:true}};
await mkdir(root,{recursive:true});let writing=Promise.resolve(),stopping=false;
const controller=new AbortController();
const wait=ms=>new Promise(done=>{const finish=()=>{clearTimeout(timer);controller.signal.removeEventListener('abort',finish);done();};const timer=setTimeout(finish,ms);if(controller.signal.aborted)finish();else controller.signal.addEventListener('abort',finish,{once:true});});
function save(){const snapshot=JSON.stringify(status,null,2);writing=writing.catch(()=>{}).then(async()=>{const file=join(root,'status.json');await writeFile(file+'.tmp',snapshot,{mode:0o600});await rename(file+'.tmp',file);});return writing;}
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;status.mode='stopping';controller.abort();void save();});
// IDs whose bytes, SHA-256 and ETag were confirmed by the R2 backup (read-only state of the backup service).
async function uploaded(){if(!cloudState)return new Set();try{const state=JSON.parse(await readFile(join(cloudState,'r2-state.json'),'utf8'));return new Set((state.records||[]).map(x=>x.id));}catch(e){if(e.code!=='ENOENT'&&e.name!=='SyntaxError')throw e;return new Set();}}
let capacityAt=0,capacityValue=false,capacityJob=null;
async function capacity(){if(Date.now()-capacityAt<15000)return capacityValue;if(capacityJob)return capacityJob;capacityJob=(async()=>{
 if(rotating){const result=await archive.enforceRetention({maxBytes:limitBytes,...policy,uploaded:await uploaded()});Object.assign(status.retention,{lastCheck:new Date().toISOString(),lastDeleted:result.deleted.length,lastDeletedBackedUp:result.backedUpDeleted,lastDeletedLocalOnly:result.localOnlyDeleted,blocked:result.blocked});}
 const space=await statfs(root),free=Number(space.bavail)*Number(space.bsize),total=Number(space.blocks)*Number(space.bsize),used=await archive.usage();
 status.disk={totalBytes:total,freeBytes:free,archiveBytes:used,at:new Date().toISOString()};
 capacityValue=(!limitBytes||used<limitBytes)&&free>reserveBytes;capacityAt=Date.now();return capacityValue;})().finally(()=>{capacityJob=null;});return capacityJob;}
// A dual-lens camera (Outdoor Pro) times out when both views connect at once: views of one physical
// camera take turns, and the next one may connect only after the previous delivers frames (or 30 s pass).
const cameraTurns=new Map();
function cameraTurn(alias){const camera=cameraName(alias),previous=cameraTurns.get(camera)||Promise.resolve();let release;const mine=new Promise(done=>{release=done;});const timer=setTimeout(()=>release(),30000);const chain=previous.then(()=>mine);cameraTurns.set(camera,chain);return{ready:previous,release(){clearTimeout(timer);release();}};}
// Validate independently: one unavailable camera must not stop the other backups.
for(const alias of aliases)status.streams[alias]={state:'waiting'};
await save();
const organized=await archive.organizeLegacy();if(organized.moved.length){status.migrated=organized.moved.length;await save();}
await Promise.all(aliases.map(async(alias,index)=>{
 await wait(index*2000);let validated=false,failures=0;
 while(!stopping){
  if(!await capacity()){status.streams[alias].state='paused_capacity';await save();await wait(30000);continue;}
  try{
   if(!validated){const turn=cameraTurn(alias);try{await turn.ready;status.streams[alias].state='testing';await save();const probe=await archive.record(alias,10,{keep:process.env.MIZIN_ARCHIVE_CONTINUOUS!=='1'});status.streams[alias]={state:'validated',validatedAt:new Date().toISOString(),probe};validated=true;await save();}finally{turn.release();}}
   if(process.env.MIZIN_ARCHIVE_CONTINUOUS!=='1')return;
   const turn=cameraTurn(alias);await turn.ready;
   status.mode='continuous';status.streams[alias].state='recording';await save();
   try{await archive.continuous(alias,{signal:controller.signal,segmentSeconds,canContinue:capacity,onProgress:async progress=>{turn.release();status.streams[alias].lastFrameAt=progress.at;status.streams[alias].frames=progress.frame;await save();},onSegment:async record=>{status.streams[alias]={...status.streams[alias],state:'recording',lastRecording:record,error:undefined};failures=0;await save();}});}finally{turn.release();}
  }catch(error){failures++;const delay=Math.min(60000,15000*2**Math.min(failures-1,2))+Math.floor(Math.random()*5000);status.streams[alias]={...status.streams[alias],state:'retrying',failures,failedAt:new Date().toISOString(),cause:String(error?.message||error).slice(0,200),error:`Fluxo interrompido; nova tentativa em ${Math.round(delay/1000)} segundos.`};await save();if(!stopping)await wait(delay);}
 }
}));
if(!stopping){status.mode='test_complete';await save();}
