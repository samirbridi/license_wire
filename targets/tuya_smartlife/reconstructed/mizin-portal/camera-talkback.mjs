import {spawn} from 'node:child_process';

export function opusPackets(buffer){
 const packets=[];let offset=0,parts=[];
 while(offset<buffer.length){
  if(offset+27>buffer.length||buffer.toString('ascii',offset,offset+4)!=='OggS')throw new Error('Contêiner de áudio inválido.');
  const count=buffer[offset+26],table=offset+27;let cursor=table+count;
  if(cursor>buffer.length)throw new Error('Áudio incompleto.');
  for(let i=0;i<count;i++){
   const size=buffer[table+i];if(cursor+size>buffer.length)throw new Error('Áudio incompleto.');
   parts.push(buffer.subarray(cursor,cursor+size));cursor+=size;
   if(size<255){const packet=Buffer.concat(parts);parts=[];const magic=packet.subarray(0,8).toString('ascii');if(magic!=='OpusHead'&&magic!=='OpusTags'&&packet.length)packets.push(packet);}
  }
  offset=cursor;
 }
 if(parts.length)throw new Error('Pacote de áudio incompleto.');
 return packets;
}

export function encodeSpeech(ffmpeg,audio,contentType,opus,spawnProcess=spawn){
 const pcm=/^audio\/pcm(?:;|$)/i.test(contentType),webm=/^audio\/webm(?:;|$)/i.test(contentType);
 if(!pcm&&!webm)throw new Error('Formato de microfone não suportado.');
 const rate=Number(/(?:^|;)\s*rate=(\d+)/i.exec(contentType)?.[1]??16000);
 if(pcm&&(![8000,16000,24000,44100,48000].includes(rate)||audio.length%2))throw new Error('PCM inválido.');
 if(!audio.length||audio.length>1024*1024)throw new Error('Bloco de áudio inválido.');
 const input=pcm?['-f','s16le','-ar',String(rate),'-ac','1','-i','pipe:0']:['-i','pipe:0'];
 const output=opus?['-c:a','libopus','-ar','48000','-ac','1','-b:a','32k','-vbr','off','-frame_duration','20','-application','voip','-f','ogg','pipe:1']:['-c:a','pcm_alaw','-ar','8000','-ac','1','-f','alaw','pipe:1'];
 return new Promise((resolve,reject)=>{
  const child=spawnProcess(ffmpeg,['-hide_banner','-nostdin','-loglevel','error',...input,...output],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  const chunks=[];let size=0,done=false;
  const finish=(err,value)=>{if(done)return;done=true;clearTimeout(timer);err?reject(err):resolve(value);};
  const timer=setTimeout(()=>{child.kill();finish(new Error('Tempo esgotado ao codificar o microfone.'));},5000);
  child.stderr.resume();child.stdin.on('error',()=>{});
  child.stdout.on('data',c=>{size+=c.length;if(size>2*1024*1024){child.kill();finish(new Error('Áudio excedeu o limite.'));}else chunks.push(c);});
  child.once('error',()=>finish(new Error('Codificador de áudio indisponível.')));
  child.once('close',code=>finish(code===0?null:new Error('Falha ao codificar o microfone.'),Buffer.concat(chunks)));
  child.stdin.end(audio);
 });
}

export function createTalkback({resolveCamera,send,encode}){
 const queues=new Map();
 return async({cameraId,action='',audio=Buffer.alloc(0),contentType=''})=>{
  const meta=resolveCamera(cameraId);if(!meta?.did)throw new Error('Câmera não encontrada no inventário.');
  if(!['','send','start','stop'].includes(action))throw new Error('Ação de microfone inválida.');
  const prior=queues.get(meta.did)??Promise.resolve();
  const job=prior.catch(()=>{}).then(async()=>{
   const target={did:meta.did,model:meta.model,host:meta.host,user:meta.user,region:meta.region};
   if(action==='start'||action==='stop'){
    const reply=await send({...target,action});if(reply?.ok!==true)throw new Error('A câmera não confirmou o canal de fala.');
    return{ok:true,cameraId,action};
   }
   if(audio.length<40)throw new Error('Bloco de microfone vazio ou muito curto.');
   const opus=['xiaomi.camera.cw701','mxiang.camera.mod11'].includes(meta.model);
   const data=await encode(audio,contentType,opus);
   const payload=opus?{codec:'opus',framesBase64:opusPackets(data).map(p=>p.toString('base64'))}:{codec:'pcma',rawBase64:data.toString('base64')};
   const reply=await send({...target,action:'send',...payload});
   if(reply?.ok!==true||!(reply.framesSent>0)||!(reply.bytesSent>0))throw new Error('A ponte não confirmou o envio do áudio.');
   return{ok:true,cameraId,codec:payload.codec,framesSent:reply.framesSent,bytesSent:reply.bytesSent,backchannelStatus:'sent_to_camera'};
  });
  queues.set(meta.did,job);try{return await job;}finally{if(queues.get(meta.did)===job)queues.delete(meta.did);}
 };
}
