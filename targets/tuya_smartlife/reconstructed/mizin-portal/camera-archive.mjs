import {mkdir,readFile,readdir,rename,stat,writeFile,realpath} from 'node:fs/promises';
import {join,resolve,sep,basename} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {createReadStream} from 'node:fs';
import {createArchiveIndex} from './archive-index.mjs';

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
 async function publish(partial,id,alias,startedAt,minimumDuration){
  const probe=JSON.parse((await command([ffprobe,'-v','error','-show_streams','-show_format','-of','json',partial],15)).toString());
  if(!probe.streams?.some(s=>s.codec_type==='video')||!probe.streams?.some(s=>s.codec_type==='audio')||!Number.isFinite(Number(probe.format.duration))||Number(probe.format.duration)<minimumDuration)throw new Error('Gravação incompleta; arquivo preservado para diagnóstico.');
  const folder=index.folder(alias,startedAt);await mkdir(folder,{recursive:true,mode:0o700});const destination=join(folder,id+'.mkv');await rename(partial,destination);const info=await stat(destination),hash=createHash('sha256');for await(const chunk of createReadStream(destination))hash.update(chunk);
  const record={id,alias,startedAt,duration:Number(probe.format.duration),bytes:info.size,sha256:hash.digest('hex'),container:'matroska',transcoded:false,source:'nas',streams:probe.streams.map(s=>({type:s.codec_type,codec:s.codec_name,width:s.width,height:s.height,sampleRate:s.sample_rate,channels:s.channels}))};
  await writeFile(join(folder,id+'.json'),JSON.stringify(record,null,2),{flag:'wx',mode:0o600});index.invalidate();return record;
 }
 async function list(){
  if(!index)return[];return(await index.entries()).map(x=>x.record).reverse().slice(0,10000);
 }
 return{
  enabled:!!directory,list,
  async usage(){enabled();return index.usage({statFile});},
  async enforceRetention(options){enabled();return index.prune(options);},
  async organizeLegacy(options){enabled();return index.organizeLegacy(options);},
  async record(alias,seconds=10){
   enabled();if(!known.has(alias)||!Number.isInteger(seconds)||seconds<5||seconds>300)throw new Error('Câmera ou duração inválida.');
   await mkdir(directory,{recursive:true,mode:0o700});
   const space=await import('node:fs/promises').then(fs=>fs.statfs(directory));
   if(Number(space.bavail)*Number(space.bsize)<2*1024**3)throw new Error('Gravação pausada: menos de 2 GB livres.');
   const working=join(directory,'_work');await mkdir(working,{recursive:true,mode:0o700});const id=randomUUID().replaceAll('-',''),partial=join(working,id+'.partial.mkv'),startedAt=new Date().toISOString();
   const source=sourceFor(alias);
   await command([ffmpeg,'-hide_banner','-nostdin','-loglevel','error','-rw_timeout','20000000','-fflags','+genpts','-i',source,'-t',String(seconds),'-map','0:v:0','-map','0:a:0','-c','copy','-fs','268435456','-avoid_negative_ts','make_zero','-f','matroska',partial],seconds+50);
   return publish(partial,id,alias,startedAt,seconds-1);
  },
  async continuous(alias,{signal,segmentSeconds=300,canContinue=async()=>true,onSegment=async()=>{},onProgress=async()=>{},stallMs=90000}={}){
   enabled();if(!known.has(alias)||!Number.isInteger(segmentSeconds)||segmentSeconds<2||segmentSeconds>300)throw new Error('Gravador contínuo inválido.');
   await mkdir(directory,{recursive:true,mode:0o700});
   const working=join(directory,'_work');await mkdir(working,{recursive:true,mode:0o700});const run=randomUUID().replaceAll('-',''),csv=join(working,run+'.segments.csv'),started=Date.now(),seen=new Set();
   let stopped=false,failure=null,checking=null,lastFrameAt=Date.now(),lastFrame=0,progressBuffer='';
   const child=spawnProcess(ffmpeg,['-hide_banner','-nostdin','-loglevel','error','-rw_timeout','20000000','-fflags','+genpts','-i',sourceFor(alias),'-map','0:v:0','-map','0:a:0','-c','copy','-avoid_negative_ts','make_zero','-progress','pipe:1','-stats_period','5','-f','segment','-segment_format','matroska','-segment_time',String(segmentSeconds),'-reset_timestamps','1','-segment_list',csv,'-segment_list_type','csv',join(working,run+'-%06d.partial.mkv')],{windowsHide:true,stdio:['ignore','pipe','pipe']});
   child.stderr.resume();
   child.stdout.on('data',chunk=>{progressBuffer+=chunk.toString();if(progressBuffer.length>65536)progressBuffer=progressBuffer.slice(-8192);let end;while((end=progressBuffer.indexOf('\n'))>=0){const line=progressBuffer.slice(0,end).trim();progressBuffer=progressBuffer.slice(end+1);if(line.startsWith('frame=')){const frame=Number(line.slice(6));if(frame>lastFrame){lastFrame=frame;lastFrameAt=Date.now();void onProgress({frame,at:new Date(lastFrameAt).toISOString()}).catch(()=>{});}}}});
   const stop=()=>{stopped=true;child.kill('SIGINT');};signal?.addEventListener('abort',stop,{once:true});
   async function inspect(final=false){
    let content='';try{content=await readFile(csv,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
    for(const line of content.split(/\r?\n/)){
     const match=/^(?:"([^"]+)"|([^,]+)),([\d.]+),([\d.]+)$/.exec(line);if(!match)continue;
     const name=basename(match[1]||match[2]);if(!new RegExp('^'+run+'-\\d{6}\\.partial\\.mkv$').test(name)||seen.has(name))continue;
     const start=Number(match[3]),end=Number(match[4]);if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw new Error('Índice de segmentos inválido.');
     const id=createHash('sha256').update(name).digest('hex').slice(0,32);
     const record=await publish(join(working,name),id,alias,new Date(started+start*1000).toISOString(),Math.max(0.05,end-start-1));seen.add(name);await onSegment(record);
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
  async file(id){enabled();const item=await index.find(id);return{file:item.file,record:item.record};}
 };
}
