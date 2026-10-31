import {mkdir,readFile,readdir,rename,stat,writeFile,realpath,unlink} from 'node:fs/promises';
import {join,resolve,sep,basename} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {createArchiveIndex} from './archive-index.mjs';

const segmentId=name=>createHash('sha256').update(name).digest('hex').slice(0,32);
// Wall-clock start of a finished segment. With clock-aligned cuts every segment after the first starts on a
// :00/:15/:30/:45 mark. The stream timestamps fall behind the wall clock when the camera stalls (the bridge skips
// the missing time), so the mark comes from when the segment closed minus its stream length, never from the run
// start plus the stream offset. The 60 s slack covers streams running slightly ahead (the GOP replayed on join).
export function segmentStart({started,start,end,closedAt,segmentSeconds,clockAligned}){
 if(!clockAligned||start<=0)return started+start*1000;
 const step=segmentSeconds*1000;return Math.floor((closedAt-(end-start)*1000+60000)/step)*step;
}
export function createArchive({root,ffmpeg='ffmpeg',ffprobe='ffprobe',aliases,spawnProcess=spawn,statFile=stat,sourceFor=alias=>'http://127.0.0.1:19843/api/stream.mp4?src='+encodeURIComponent(alias)+'&video=h265&audio=all'}){
 const directory=root?resolve(root):null,known=new Set(aliases);
 const index=directory?createArchiveIndex({root:directory,aliases}):null;
 async function command(args,seconds){
  return new Promise((accept,reject)=>{
   const child=spawnProcess(args[0],args.slice(1),{windowsHide:true,stdio:['ignore','pipe','pipe']});const out=[];let size=0;
   const timer=setTimeout(()=>{child.kill();reject(new Error('Tempo esgotado ao gravar.'));},seconds*1000);
   child.stderr.resume();child.stdout.on('data',c=>{size+=c.length;if(size>1024*1024){child.kill();reject(new Error('Diagnóstico excedeu o limite.'));}else out.push(c);});
   child.once('error',()=>{clearTimeout(timer);reject(new Error('Ferramenta de vídeo indisponível.'));});
   child.once('close',code=>{clearTimeout(timer);code===0?accept(Buffer.concat(out)):reject(new Error('Falha ao receber a gravação.'));});
  });
 }
 function enabled(){if(!directory)throw new Error('Gravação no NAS ainda não configurada.');}
 // 60 s: when the NAS runs out of memory a plain ffprobe has taken more than 15 s (2026-10-30), and the
 // segment it was checking used to be left behind in _work.
 async function probeFile(partial){return JSON.parse((await command([ffprobe,'-v','error','-show_streams','-show_format','-of','json',partial],60)).toString());}
 function checkProbe(probe,minimumDuration){
  if(!probe.streams?.some(s=>s.codec_type==='video')||!probe.streams?.some(s=>s.codec_type==='audio')||!Number.isFinite(Number(probe.format?.duration))||Number(probe.format.duration)<minimumDuration)throw new Error('Gravação incompleta; arquivo preservado para diagnóstico.');
  return probe;
 }
 async function inspectFile(partial,minimumDuration){return checkProbe(await probeFile(partial),minimumDuration);}
 // lenient: a segment ffmpeg already finished is the camera's footage even when the check fails or times out.
 // It is published marked incomplete (with the reason) instead of staying in _work, where nobody sees it.
 async function publish(partial,id,alias,startedAt,minimumDuration,labelAt=startedAt,{lenient=false,fallbackDuration=0,extra={}}={}){
  let probe=null,problem;
  if(!lenient)probe=await inspectFile(partial,minimumDuration);
  else{
   if((await stat(partial)).size===0)throw new Error('Segmento vazio.');
   try{probe=await probeFile(partial);checkProbe(probe,minimumDuration);}catch(error){problem=String(error?.message||error).slice(0,160);}
  }
  const probed=Number(probe?.format?.duration),duration=Number.isFinite(probed)?probed:fallbackDuration;
  const {dir,name}=await index.reserveName(alias,labelAt);await mkdir(join(dir,'.meta'),{recursive:true,mode:0o700});const destination=join(dir,name+'.mkv');await rename(partial,destination);const info=await stat(destination),hash=createHash('sha256');for await(const chunk of createReadStream(destination))hash.update(chunk);
  const record={id,alias,startedAt,file:name+'.mkv',duration,bytes:info.size,sha256:hash.digest('hex'),container:'matroska',transcoded:false,source:'nas',streams:(probe?.streams||[]).map(s=>({type:s.codec_type,codec:s.codec_name,width:s.width,height:s.height,sampleRate:s.sample_rate,channels:s.channels})),...(problem?{incomplete:true,problem}:{}),...extra};
  await writeFile(join(dir,'.meta',name+'.json'),JSON.stringify(record,null,2),{flag:'wx',mode:0o600});index.invalidate();return record;
 }
 async function list(){
  if(!index)return[];return(await index.entries()).map(x=>x.record).reverse().slice(0,10000);
 }
 return{
  enabled:!!directory,list,
  async usage(){enabled();return index.usage({statFile});},
  async enforceRetention(options){enabled();return index.prune(options);},
  async organizeLegacy(options){enabled();return index.organizeLegacy(options);},
  async record(alias,seconds=10,{keep=true}={}){
   enabled();if(!known.has(alias)||!Number.isInteger(seconds)||seconds<5||seconds>300)throw new Error('Câmera ou duração inválida.');
   await mkdir(directory,{recursive:true,mode:0o700});
   const space=await import('node:fs/promises').then(fs=>fs.statfs(directory));
   if(Number(space.bavail)*Number(space.bsize)<2*1024**3)throw new Error('Gravação pausada: menos de 2 GB livres.');
   const working=join(directory,'_work');await mkdir(working,{recursive:true,mode:0o700});const id=randomUUID().replaceAll('-',''),partial=join(working,id+'.partial.mkv'),startedAt=new Date().toISOString();
   const source=sourceFor(alias);
   await command([ffmpeg,'-hide_banner','-nostdin','-loglevel','error','-rw_timeout','20000000','-fflags','+genpts','-i',source,'-t',String(seconds),'-map','0:v:0','-map','0:a:0','-c','copy','-fs','268435456','-avoid_negative_ts','make_zero','-f','matroska',partial],seconds+50);
   if(keep)return publish(partial,id,alias,startedAt,seconds-1);
   // Validation only: the probe must pass, but the short test file is not kept in the archive.
   try{const probe=await inspectFile(partial,seconds-1);return{id,alias,startedAt,duration:Number(probe.format.duration),validationOnly:true};}finally{await unlink(partial).catch(()=>{});}
  },
  async continuous(alias,{signal,segmentSeconds=900,clockAligned=true,canContinue=async()=>true,onSegment=async()=>{},onSegmentError=async()=>{},onProgress=async()=>{},stallMs=90000}={}){
   enabled();if(!known.has(alias)||!Number.isInteger(segmentSeconds)||segmentSeconds<2||segmentSeconds>3600)throw new Error('Gravador contínuo inválido.');
   await mkdir(directory,{recursive:true,mode:0o700});
   const working=join(directory,'_work');await mkdir(working,{recursive:true,mode:0o700});const run=randomUUID().replaceAll('-',''),csv=join(working,run+'.segments.csv'),started=Date.now(),seen=new Set(),attempts=new Map();
   // Lets recover() publish this run's segments under the right camera if the process dies before it does.
   await writeFile(join(working,run+'.run.json'),JSON.stringify({alias,startedAt:new Date(started).toISOString(),segmentSeconds,clockAligned}),{mode:0o600});
   let stopped=false,failure=null,checking=null,lastFrameAt=Date.now(),lastFrame=0,progressBuffer='';
   const child=spawnProcess(ffmpeg,['-hide_banner','-nostdin','-loglevel','error','-rw_timeout','20000000','-fflags','+genpts','-i',sourceFor(alias),'-map','0:v:0','-map','0:a:0','-c','copy','-avoid_negative_ts','make_zero','-progress','pipe:1','-stats_period','5','-f','segment','-segment_format','matroska','-segment_time',String(segmentSeconds),...(clockAligned?['-segment_atclocktime','1']:[]),'-reset_timestamps','1','-segment_list',csv,'-segment_list_type','csv',join(working,run+'-%06d.partial.mkv')],{windowsHide:true,stdio:['ignore','pipe','pipe']});
   child.stderr.resume();
   child.stdout.on('data',chunk=>{progressBuffer+=chunk.toString();if(progressBuffer.length>65536)progressBuffer=progressBuffer.slice(-8192);let end;while((end=progressBuffer.indexOf('\n'))>=0){const line=progressBuffer.slice(0,end).trim();progressBuffer=progressBuffer.slice(end+1);if(line.startsWith('frame=')){const frame=Number(line.slice(6));if(frame>lastFrame){lastFrame=frame;lastFrameAt=Date.now();void onProgress({frame,at:new Date(lastFrameAt).toISOString()}).catch(()=>{});}}}});
   const stop=()=>{stopped=true;child.kill('SIGINT');};signal?.addEventListener('abort',stop,{once:true});
   async function inspect(final=false){
    let content='';try{content=await readFile(csv,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
    for(const line of content.split(/\r?\n/)){
     const match=/^(?:"([^"]+)"|([^,]+)),([\d.]+),([\d.]+)$/.exec(line);if(!match)continue;
     const name=basename(match[1]||match[2]);if(!new RegExp('^'+run+'-\\d{6}\\.partial\\.mkv$').test(name)||seen.has(name))continue;
     const start=Number(match[3]),end=Number(match[4]);if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start){seen.add(name);continue;}
     // Clock-aligned cuts land on the first keyframe after :00/:15/:30/:45; name by that mark so both views of a camera pair up.
     const at=segmentStart({started,start,end,closedAt:Date.now(),segmentSeconds,clockAligned});
     let record;
     try{record=await publish(join(working,name),segmentId(name),alias,new Date(at).toISOString(),Math.max(0.05,end-start-1),new Date(at).toISOString(),{lenient:true,fallbackDuration:end-start});}
     catch(error){
      // A segment that cannot be published must not stop the recording that is still running; after 3 tries it is
      // left in _work for recover() at the next start.
      const tries=(attempts.get(name)||0)+1;attempts.set(name,tries);if(tries>=3){seen.add(name);await onSegmentError({file:name,error}).catch(()=>{});}
      continue;
     }
     seen.add(name);await onSegment(record);
    }
    if(!final&&Date.now()-lastFrameAt>stallMs){failure=new Error('A câmera deixou de enviar novos quadros.');stop();}
    if(!final&&(!await canContinue()||signal?.aborted))stop();
   }
   const closed=new Promise((accept,reject)=>{child.once('error',reject);child.once('close',accept);});
   const timer=setInterval(()=>{if(checking)return;checking=inspect().catch(error=>{failure=error;stop();}).finally(()=>{checking=null;});},2000);
   let code;try{code=await closed;}finally{clearInterval(timer);signal?.removeEventListener('abort',stop);if(checking)await checking;}
   await inspect(true);if(failure)throw failure;if(code!==0&&!stopped)throw new Error('Fluxo interrompido; os segmentos concluídos foram preservados.');
   return{segments:seen.size,stopped};
  },
  // Publishes segments left in _work by an earlier process (killed, or stopped by a failed check before 0063).
  // The camera comes from <run>.run.json or, for older runs, from a sibling segment already in the archive.
  async recover({minAgeMs=60000,now=Date.now()}={}){
   enabled();const working=join(directory,'_work');let names;
   try{names=await readdir(working);}catch(e){if(e.code==='ENOENT')return{recovered:[],skipped:[]};throw e;}
   const runs=new Map();for(const name of names){const m=/^([0-9a-f]{32})-(\d{6})\.partial\.mkv$/.exec(name);if(m){if(!runs.has(m[1]))runs.set(m[1],[]);runs.get(m[1]).push({name,number:Number(m[2])});}}
   const recovered=[],skipped=[];let byId=null;
   for(const [run,files] of runs){
    let info=null;try{info=JSON.parse(await readFile(join(working,run+'.run.json'),'utf8'));}catch(e){if(e.code!=='ENOENT'&&e.name!=='SyntaxError')throw e;}
    let alias=info&&known.has(info.alias)?info.alias:null;
    if(!alias){byId??=new Map((await index.entries(true)).map(x=>[x.record.id,x.record]));const last=Math.max(...files.map(f=>f.number));for(let n=0;n<=last+1&&!alias;n++){const sibling=byId.get(segmentId(`${run}-${String(n).padStart(6,'0')}.partial.mkv`));if(sibling&&known.has(sibling.alias))alias=sibling.alias;}}
    if(!alias){skipped.push(...files.map(f=>({file:f.name,reason:'câmera desconhecida'})));continue;}
    const offsets=new Map();
    try{for(const line of (await readFile(join(working,run+'.segments.csv'),'utf8')).split(/\r?\n/)){const m=/^(?:"([^"]+)"|([^,]+)),([\d.]+),([\d.]+)$/.exec(line);if(m)offsets.set(basename(m[1]||m[2]),{start:Number(m[3]),end:Number(m[4])});}}catch(e){if(e.code!=='ENOENT')throw e;}
    const segmentSeconds=Number(info?.segmentSeconds)||900,clockAligned=info?.clockAligned??true,started=Date.parse(info?.startedAt)||0;
    for(const file of files.sort((a,b)=>a.number-b.number)){
     const path=join(working,file.name);let found;try{found=await stat(path);}catch(e){if(e.code==='ENOENT')continue;throw e;}
     if(now-found.mtimeMs<minAgeMs||found.size===0){skipped.push({file:file.name,reason:found.size?'recente':'vazio'});continue;}
     const offset=offsets.get(file.name),length=offset&&offset.end>offset.start?offset.end-offset.start:0;
     // Segment 0 starts with the run; every later one on a clock mark, found from when the file was last written.
     const at=file.number===0&&started?started:file.number>0&&clockAligned?segmentStart({started:0,start:1,end:1+length,closedAt:found.mtimeMs,segmentSeconds,clockAligned}):found.mtimeMs-length*1000;
     try{const record=await publish(path,segmentId(file.name),alias,new Date(at).toISOString(),0,new Date(at).toISOString(),{lenient:true,fallbackDuration:length,extra:{recovered:true}});recovered.push({file:file.name,alias,startedAt:record.startedAt,bytes:record.bytes});}
     catch(error){skipped.push({file:file.name,reason:String(error?.message||error).slice(0,120)});}
    }
   }
   return{recovered,skipped};
  },
  async file(id){enabled();const item=await index.find(id);return{file:item.file,record:item.record};}
 };
}
