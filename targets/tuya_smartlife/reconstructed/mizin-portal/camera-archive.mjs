import {mkdir,readFile,readdir,rename,stat,writeFile,realpath} from 'node:fs/promises';
import {join,resolve,sep} from 'node:path';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';

export function createArchive({root,ffmpeg='ffmpeg',ffprobe='ffprobe',aliases,spawnProcess=spawn}){
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
 async function list(){
  if(!directory)return[];let files;try{files=await readdir(directory);}catch(e){if(e.code==='ENOENT')return[];throw e;}
  const records=[];
  for(const name of files.filter(x=>/^[a-f0-9]{32}\.json$/.test(x))){try{const data=JSON.parse(await readFile(join(directory,name),'utf8'));if(known.has(data.alias)&&/^[a-f0-9]{32}$/.test(data.id))records.push(data);}catch{}}
  return records.sort((a,b)=>b.startedAt.localeCompare(a.startedAt)).slice(0,1000);
 }
 return{
  enabled:!!directory,list,
  async usage(){enabled();let total=0;for(const name of await readdir(directory)){if(/\.mkv$/.test(name)){const info=await stat(join(directory,name));total+=info.size;}}return total;},
  async record(alias,seconds=10){
   enabled();if(!known.has(alias)||!Number.isInteger(seconds)||seconds<5||seconds>300)throw new Error('Câmera ou duração inválida.');
   await mkdir(directory,{recursive:true,mode:0o700});
   const space=await import('node:fs/promises').then(fs=>fs.statfs(directory));
   if(Number(space.bavail)*Number(space.bsize)<2*1024**3)throw new Error('Gravação pausada: menos de 2 GB livres.');
   const id=randomUUID().replaceAll('-',''),partial=join(directory,id+'.partial.mkv'),destination=join(directory,id+'.mkv'),startedAt=new Date().toISOString();
   const source='http://127.0.0.1:19843/api/stream.mp4?src='+encodeURIComponent(alias)+'&video=h265&audio=all';
   await command([ffmpeg,'-hide_banner','-nostdin','-loglevel','error','-rw_timeout','20000000','-fflags','+genpts','-i',source,'-t',String(seconds),'-map','0:v:0','-map','0:a:0','-c','copy','-fs','268435456','-avoid_negative_ts','make_zero','-f','matroska',partial],seconds+50);
   const probe=JSON.parse((await command([ffprobe,'-v','error','-show_streams','-show_format','-of','json',partial],15)).toString());
   if(!probe.streams?.some(s=>s.codec_type==='video')||!probe.streams?.some(s=>s.codec_type==='audio')||Number(probe.format.duration)<seconds-1)throw new Error('Gravação incompleta; arquivo preservado para diagnóstico.');
   await rename(partial,destination);const info=await stat(destination);
   const record={id,alias,startedAt,duration:Number(probe.format.duration),bytes:info.size,container:'matroska',transcoded:false,source:'nas',streams:probe.streams.map(s=>({type:s.codec_type,codec:s.codec_name,width:s.width,height:s.height,sampleRate:s.sample_rate,channels:s.channels}))};
   await writeFile(join(directory,id+'.json'),JSON.stringify(record,null,2),{flag:'wx',mode:0o600});return record;
  },
  async file(id){enabled();if(!/^[a-f0-9]{32}$/.test(id))throw new Error('Gravação inválida.');const record=JSON.parse(await readFile(join(directory,id+'.json'),'utf8'));if(!known.has(record.alias))throw new Error('Câmera desconhecida.');const file=await realpath(join(directory,id+'.mkv'));if(!file.startsWith((await realpath(directory))+sep))throw new Error('Arquivo fora do armazenamento.');return{file,record};}
 };
}
