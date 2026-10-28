import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';
import { validDay, moveDay } from './public/recordings-core.js';

const zone = 'America/Sao_Paulo';
const dayFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: zone });
const clockFormat = new Intl.DateTimeFormat('sv-SE', { timeZone: zone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' });
export function dayStart(day) {
  if (!validDay(day)) throw new Error('Data inválida.');
  const target = Date.parse(day + 'T00:00:00Z'); let guess = target;
  for (let i=0;i<3;i++) { const p=Object.fromEntries(clockFormat.formatToParts(new Date(guess)).map(x=>[x.type,x.value])); const wall=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute,+p.second); guess += target-wall; }
  return guess/1000;
}
export function normalizeCatalog(raw) {
  if (raw.catalogError || !Array.isArray(raw.catalogItems)) throw new Error('O cartão não retornou um catálogo válido. Tente novamente.');
  const byTime = new Map();
  for (const item of raw.catalogItems) {
    const start=item.startTime, end=item.endTime;
    if (!Number.isInteger(start)||!Number.isInteger(end)||start<1577836800||start>Date.now()/1000+60||end<=start||end-start>255) throw new Error('O catálogo retornou um período inválido.');
    byTime.set(start,{id:String(start),start,end,motion:item.motion===1});
  }
  return [...byTime.values()].sort((a,b)=>a.start-b.start);
}

export function createSDBridge({target,cameras,upstream,fetcher=fetch,sources}) {
  const inventory=sources ?? JSON.parse(readFileSync(join(target,'evidence/private/camera-sources-cn.json'),'utf8').replace(/^\uFEFF/,'' )).sources;
  const normalize=s=>s.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  const devices=new Map(), cache=new Map(), pending=new Map();
  for (const camera of cameras) {
    const entry=inventory.find(s=>normalize(s.name)===normalize(camera.name)); if (!entry) continue;
    const url=new URL(entry.url), model=url.searchParams.get('model'), did=url.searchParams.get('did');
    if (url.protocol!=='xiaomi:'||!isIP(url.hostname)||!/^\d+$/.test(did??'')||!['xiaomi.camera.cw701','mxiang.camera.mod11','isa.camera.hlc7'].includes(model)||url.password!=='cn') continue;
    devices.set(camera.id,{url,model,did,views:camera.views??[{id:'main'}]});
  }
  function selected(id,view) {
    const device=devices.get(id); if (!device) throw new Error('Câmera sem integração de cartão.');
    const index=device.views.findIndex(v=>v.id===view); if(index<0)throw new Error('Visão inválida.');
    return {...device,channel:device.model==='xiaomi.camera.cw701'&&index===1?10:0};
  }
  async function catalog(id,view) {
    const device=selected(id,view),key=id+':'+device.channel, prior=cache.get(key);
    if(prior&&Date.now()-prior.at<30000)return prior;
    if(pending.has(key))return pending.get(key);
    const job=(async()=>{
      const endpoint=new URL(upstream+'/api/xiaomi/storage');
      for(const [k,v] of Object.entries({did:device.did,model:device.model,host:device.url.hostname,user:device.url.username,region:'cn',catalog:'1',channel:device.channel}))endpoint.searchParams.set(k,String(v));
      for(let attempt=0;attempt<2;attempt++){
        try{
          const response=await fetcher(endpoint,{signal:AbortSignal.timeout(22000)});
          if(!response.ok){await response.body?.cancel();throw new Error('Não foi possível consultar o cartão.');}
          const raw=await response.json(),periods=normalizeCatalog(raw);
          const value={at:Date.now(),periods,cardStatus:Number.isInteger(raw.status)?raw.status:null};cache.set(key,value);return value;
        }catch(error){if(attempt===1)throw error;await new Promise(resolve=>setTimeout(resolve,300));}
      }
    })();
    pending.set(key,job);try{return await job;}finally{pending.delete(key);}
  }
  return {
    async list(id,view,date) {
      const state=await catalog(id,view),start=dayStart(date),end=dayStart(moveDay(date,1));
      return {source:'sd',status:'ready',date,view,displayTimeZone:zone,dayStart:start,dayEnd:end,observedAt:new Date(state.at).toISOString(),cardStatus:state.cardStatus,periods:state.periods.filter(p=>p.end>start&&p.start<end),availableDays:[...new Set(state.periods.map(p=>dayFormat.format(new Date(p.start*1000))))],capabilities:{playback:true,export:true,maxExportSeconds:60,singleFileExport:true,audio:false}};
    },
    async open(id,view,at,end) {
      if(!Number.isInteger(at))throw new Error('Horário inválido.');
      const device=selected(id,view),state=await catalog(id,view),entry=state.periods.find(p=>p.start<=at&&at<p.end);
      if(!entry)throw new Error('Não há gravação nesse instante.');
      const stop=end??Math.min(entry.end,at+60);
      if(!Number.isInteger(stop)||stop<=at||stop>entry.end||stop-at>60)throw new Error('Selecione até 60 segundos dentro do arquivo exibido.');
      const source=new URL(device.url);for(const [k,v] of Object.entries({playback:entry.start,offset:at-entry.start,channel:device.channel,speed:1,audio:0}))source.searchParams.set(k,String(v));
      const alias='mizin_sd_'+randomUUID().replaceAll('-','');
      const registration=new URL(upstream+'/api/streams');registration.searchParams.set('name',alias);registration.searchParams.set('src',source.href);
      let removed=false;
      const playback={alias,duration:stop-at,fileStart:entry.start,fileEnd:entry.end,async close(){if(removed)return;removed=true;try{const removal=new URL(upstream+'/api/streams');removal.searchParams.set('src',alias);const r=await fetcher(removal,{method:'DELETE',signal:AbortSignal.timeout(5000)});await r.body?.cancel();}catch{}}};
      try{const response=await fetcher(registration,{method:'PUT',signal:AbortSignal.timeout(5000)});await response.body?.cancel();if(!response.ok)throw new Error('registration failed');}
      catch{await playback.close();throw new Error('Não foi possível preparar a reprodução.');}
      return playback;
    }
  };
}
