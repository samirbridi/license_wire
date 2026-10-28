import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createArchive} from './camera-archive.mjs';
const root=process.env.MIZIN_ARCHIVE_ROOT;
if(!root)throw new Error('Volume de gravações não configurado.');
const aliases=JSON.parse(await readFile(process.env.MIZIN_ARCHIVE_ALIASES,'utf8'));
const archive=createArchive({root,aliases,ffmpeg:process.env.MIZIN_CAMERAS_FFMPEG||'ffmpeg',ffprobe:process.env.MIZIN_FFPROBE||'ffprobe'});
const status={startedAt:new Date().toISOString(),mode:'test',streams:{},limitBytes:Number(process.env.MIZIN_ARCHIVE_LIMIT_GB||100)*1024**3,overwrite:false};
await mkdir(root,{recursive:true});
let writing=Promise.resolve();
function save(){writing=writing.then(()=>writeFile(join(root,'status.json'),JSON.stringify(status,null,2),{mode:0o600}));return writing;}
// Validate every view on this NAS before permitting continuous recording.
for(const alias of aliases){
 try{const record=await archive.record(alias,10);status.streams[alias]={state:'validated',lastRecording:record};}
 catch{status.streams[alias]={state:'test_failed',error:'O NAS não confirmou vídeo e áudio completos.'};}
 await save();
}
if(Object.values(status.streams).some(x=>x.state!=='validated')){status.mode='test_failed';await save();process.exitCode=1;}
else if(process.env.MIZIN_ARCHIVE_CONTINUOUS==='1'){
 status.mode='continuous';await save();let stopping=false;
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{stopping=true;status.mode='stopping';void save();});
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 await Promise.all(aliases.map(async alias=>{
  while(!stopping){
   const used=await archive.usage();
   // Leave headroom for at most seven concurrent 256 MiB segments; never erase recordings.
   if(used+2*1024**3>=status.limitBytes){status.mode='paused_capacity';status.streams[alias].state='paused_capacity';await save();await wait(30000);continue;}
   try{const record=await archive.record(alias,300);status.streams[alias]={state:'recording',lastRecording:record};}
   catch{status.streams[alias]={...status.streams[alias],state:'retrying',error:'Fluxo interrompido; nova tentativa em 15 segundos.'};await wait(15000);}
   await save();
  }
 }));
}else{status.mode='test_complete';await save();}
