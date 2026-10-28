import {mkdir,readFile,readdir,rename,stat,writeFile,realpath} from 'node:fs/promises';
import {join,resolve,sep,basename} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {spawn} from 'node:child_process';

export function createArchive({root,ffmpeg='ffmpeg',ffprobe='ffprobe',aliases,spawnProcess=spawn,statFile=stat,sourceFor=alias=>'http://127.0.0.1:19843/api/stream.mp4?src='+encodeURIComponent(alias)+'&video=h265&audio=all'}){
 const directory=root?resolve(root):null,known=new Set(aliases);
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
  const destination=join(directory,id+'.mkv');await rename(partial,destination);const info=await stat(destination);
  const record={id,alias,startedAt,duration:Number(probe.format.duration),bytes:info.size,container:'matroska',transcoded:false,source:'nas',streams:probe.streams.map(s=>({type:s.codec_type,codec:s.codec_name,width:s.width,height:s.height,sampleRate:s.sample_rate,channels:s.channels}))};
  await writeFile(join(directory,id+'.json'),JSON.stringify(record,null,2),{flag:'wx',mode:0o600});return record;
 }
 async function list(){
  if(!directory)return[];let files;try{files=await readdir(directory);}catch(e){if(e.code==='ENOENT')return[];throw e;}
  const records=[];
  for(const name of files.filter(x=>/^[a-f0-9]{32}\.json$/.test(x))){try{const data=JSON.parse(await readFile(join(directory,name),'utf8'));if(known.has(data.alias)&&/^[a-f0-9]{32}$/.test(data.id))records.push(data);}catch{}}
  return records.sort((a,b)=>b.startedAt.localeCompare(a.startedAt)).slice(0,1000);
 }
 return{
  enabled:!!directory,list,
  async usage(){enabled();let total=0;for(const name of await readdir(directory)){if(/\.mkv$/.test(name)){try{const info=await statFile(join(directory,name));total+=info.size;}catch(error){if(error.code!=='ENOENT')throw error;}}}return total;},
  async record(alias,seconds=10){
   enabled();if(!known.has(alias)||!Number.isInteger(seconds)||seconds<5||seconds>300)throw new Error('Câmera ou duração inválida.');
   await mkdir(directory,{recursive:true,mode:0o700});
   const space=await import('node:fs/promises').then(fs=>fs.statfs(directory));
   if(Number(space.bavail)*Number(space.bsize)<2*1024**3)throw new Error('Gravação pausada: menos de 2 GB livres.');
   const id=randomUUID().replaceAll('-',''),partial=join(directory,id+'.partial.mkv'),destination=join(directory,id+'.mkv'),startedAt=new Date().toISOString();
   const source=sourceFor(alias);
   await command([ffmpeg,'-hide_banner','-nostdin','-loglevel','error','-rw_timeout','20000000','-fflags','+genpts','-i',source,'-t',String(seconds),'-map','0:v:0','-map','0:a:0','-c','copy','-fs','268435456','-avoid_negative_ts','make_zero','-f','matroska',partial],seconds+50);
   return publish(partial,id,alias,startedAt,seconds-1);
  },
  async continuous(alias,{signal,segmentSeconds=300,canContinue=async()=>true,onSegment=async()=>{}}={}){
   enabled();if(!known.has(alias)||!Number.isInteger(segmentSeconds)||segmentSeconds<2||segmentSeconds>300)throw new Error('Gravador contínuo inválido.');
   await mkdir(directory,{recursive:true,mode:0o700});
   const run=randomUUID().replaceAll('-',''),csv=join(directory,run+'.segments.csv'),started=Date.now(),seen=new Set();
   let stopped=false,failure=null,checking=null;
   const child=spawnProcess(ffmpeg,['-hide_banner','-nostdin','-loglevel','error','-rw_timeout','20000000','-fflags','+genpts','-i',sourceFor(alias),'-map','0:v:0','-map','0:a:0','-c','copy','-avoid_negative_ts','make_zero','-f','segment','-segment_format','matroska','-segment_time',String(segmentSeconds),'-reset_timestamps','1','-segment_list',csv,'-segment_list_type','csv',join(directory,run+'-%06d.partial.mkv')],{windowsHide:true,stdio:['ignore','ignore','pipe']});
   child.stderr.resume();
   const stop=()=>{stopped=true;child.kill('SIGINT');};signal?.addEventListener('abort',stop,{once:true});
   async function inspect(final=false){
    let content='';try{content=await readFile(csv,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
    for(const line of content.split(/\r?\n/)){
     const match=/^(?:"([^"]+)"|([^,]+)),([\d.]+),([\d.]+)$/.exec(line);if(!match)continue;
     const name=basename(match[1]||match[2]);if(!new RegExp('^'+run+'-\\d{6}\\.partial\\.mkv$').test(name)||seen.has(name))continue;
     const start=Number(match[3]),end=Number(match[4]);if(!Number.isFinite(start)||!Number.isFinite(end)||end<=start)throw new Error('Índice de segmentos inválido.');
     const id=createHash('sha256').update(name).digest('hex').slice(0,32);
     const record=await publish(join(directory,name),id,alias,new Date(started+start*1000).toISOString(),Math.max(0.05,end-start-1));seen.add(name);await onSegment(record);
    }
    if(!final&&(!await canContinue()||signal?.aborted))stop();
   }
   const closed=new Promise((accept,reject)=>{child.once('error',reject);child.once('close',accept);});
   const timer=setInterval(()=>{if(checking)return;checking=inspect().catch(error=>{failure=error;stop();}).finally(()=>{checking=null;});},2000);
   let code;try{code=await closed;}finally{clearInterval(timer);signal?.removeEventListener('abort',stop);if(checking)await checking;}
   await inspect(true);if(failure)throw failure;if(code!==0&&!stopped)throw new Error('Fluxo interrompido; os segmentos concluídos foram preservados.');
   return{segments:seen.size,stopped};
  },
  async file(id){enabled();if(!/^[a-f0-9]{32}$/.test(id))throw new Error('Gravação inválida.');const record=JSON.parse(await readFile(join(directory,id+'.json'),'utf8'));if(!known.has(record.alias))throw new Error('Câmera desconhecida.');const file=await realpath(join(directory,id+'.mkv'));if(!file.startsWith((await realpath(directory))+sep))throw new Error('Arquivo fora do armazenamento.');return{file,record};}
 };
}
