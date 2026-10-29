// Gravações: linha do tempo de 24 h por câmera e dia, unindo arquivos do NAS e cópias do R2.
window.openNasArchive=async()=>{
 const el=(tag,props={},css='')=>{const node=Object.assign(document.createElement(tag),props);if(css)node.style.cssText=css;return node;};
 const zone='America/Sao_Paulo',dayOf=at=>new Date(at).toLocaleDateString('en-CA',{timeZone:zone}),clock=at=>new Date(at).toLocaleTimeString('pt-BR',{timeZone:zone});
 const secondsOfDay=at=>{const p=new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(at)),g=t=>Number(p.find(x=>x.type===t).value);return g('hour')*3600+g('minute')*60+g('second');};
 const cameraOf=alias=>alias.replace(/_quality\d+$/,'').replace(/_channel2$/,''),viewOf=alias=>/_channel2/.test(alias)?'Visão 2':data.recordings.some(r=>r.alias!==alias&&cameraOf(r.alias)===cameraOf(alias))?'Visão 1':'Gravação';
 const title=id=>id.split('_').map(w=>/^(aw|mi|hlc|cw)\d/i.test(w)?w.toUpperCase():w.charAt(0).toUpperCase()+w.slice(1)).join(' ');
 const size=b=>b>=1024**3?(b/1024**3).toFixed(1)+' GB':(b/1024**2).toFixed(0)+' MB';
 const colors={nas:'#10b981','nas+cloud':'#14b8a6',cloud:'#3b82f6'},labels={nas:'NAS','nas+cloud':'NAS + nuvem',cloud:'Somente nuvem'};
 const dialog=el('dialog',{},'width:min(1100px,94vw);max-height:92vh;overflow:auto;background:#0b1120;color:#e2e8f0;border:1px solid #334155;border-radius:20px;padding:24px;font-family:Outfit,sans-serif');
 const head=el('div',{},'display:flex;align-items:center;gap:12px;flex-wrap:wrap;justify-content:space-between');
 const heading=el('h2',{textContent:'Gravações'},'margin:0');
 const close=el('button',{textContent:'Fechar',className:'btn btn-secondary'});
 const controls=el('div',{},'display:flex;gap:10px;flex-wrap:wrap;margin-top:14px');
 const camera=el('select',{className:'form-input'});camera.setAttribute('aria-label','Câmera');
 const day=el('select',{className:'form-input'});day.setAttribute('aria-label','Dia');
 const status=el('p',{textContent:'Consultando gravações…'},'margin:12px 0 0;color:#94a3b8;font-size:14px');status.setAttribute('role','status');
 const storage=el('p',{},'margin:6px 0 0;color:#64748b;font-size:13px');
 const timeline=el('div',{},'margin-top:16px;display:grid;gap:10px');
 const legend=el('div',{},'display:flex;gap:14px;flex-wrap:wrap;font-size:12px;color:#94a3b8;margin-top:8px');
 for(const [k,v] of Object.entries(labels)){const item=el('span');item.append(el('span',{},`display:inline-block;width:10px;height:10px;border-radius:2px;background:${colors[k]};margin-right:6px`),v);legend.append(item);}
 const now=el('p',{},'margin:12px 0 0;font-size:14px');
 const video=el('video',{controls:true,playsInline:true},'width:100%;max-height:52vh;margin-top:8px;background:black;border-radius:12px;display:none');
 const list=el('div',{},'display:grid;gap:8px;margin-top:16px');
 head.append(heading,close);controls.append(camera,day);
 dialog.append(head,controls,status,storage,legend,timeline,now,video,list);document.body.append(dialog);dialog.showModal();
 close.onclick=()=>{video.pause();video.removeAttribute('src');video.load();dialog.close();dialog.remove();};
 dialog.addEventListener('cancel',()=>close.click());
 let data={recordings:[],days:[]};
 const active=typeof activePtzCam==='string'?activePtzCam.replace(/_view[12]$/,''):null;
 async function cloudDownload(record,button){button.disabled=true;try{const r=await fetch('/api/auth/cloud/download?id='+encodeURIComponent(record.id)),d=await r.json();if(!r.ok)throw new Error(d.error||'Download indisponível.');const a=el('a',{href:d.url,rel:'noreferrer'});a.referrerPolicy='no-referrer';a.click();}catch(e){status.textContent=e.message;}finally{button.disabled=false;}}
 function play(record,offset=0){
  if(record.location==='cloud'){now.textContent=`${clock(record.startedAt)} · arquivo somente no backup da nuvem; baixe o original para assistir.`;video.style.display='none';return;}
  video.style.display='block';video.src=`${BACKEND_API_BASE}/api/camera/archive/file?id=${record.id}&start=${Math.floor(offset)}`;void video.play().catch(()=>{});
  now.textContent=`${title(cameraOf(record.alias))} · ${viewOf(record.alias)} · a partir de ${clock(Date.parse(record.startedAt)+offset*1000)}`;
 }
 function render(){
  timeline.replaceChildren();list.replaceChildren();
  const records=data.recordings.filter(r=>cameraOf(r.alias)===camera.value&&dayOf(r.startedAt)===day.value);
  if(!records.length){timeline.textContent='Nenhuma gravação desta câmera neste dia.';return;}
  const views=[...new Set(records.map(r=>r.alias))].sort();
  for(const alias of views){
   const row=el('div'),label=el('div',{textContent:viewOf(alias)},'font-size:12px;color:#94a3b8;margin-bottom:4px');
   const bar=el('div',{title:'Clique para assistir a partir deste horário'},'position:relative;height:34px;background:#111827;border:1px solid #1f2937;border-radius:8px;cursor:pointer;overflow:hidden');
   for(let h=0;h<=24;h+=3){const tick=el('span',{textContent:h<24?String(h).padStart(2,'0')+'h':''},`position:absolute;left:${h/24*100}%;top:0;bottom:0;border-left:1px solid #1f2937;font-size:10px;color:#475569;padding-left:3px;pointer-events:none`);bar.append(tick);}
   const own=records.filter(r=>r.alias===alias);
   for(const r of own){const start=secondsOfDay(r.startedAt),length=Math.max(r.duration||0,30);bar.append(el('span',{title:`${clock(r.startedAt)} · ${Math.round((r.duration||0)/60)} min · ${labels[r.location]}`},`position:absolute;top:12px;bottom:4px;left:${start/864}%;width:${Math.max(length/864,.15)}%;background:${colors[r.location]};border-radius:2px;pointer-events:none`));}
   bar.onclick=event=>{const box=bar.getBoundingClientRect(),second=(event.clientX-box.left)/box.width*86400;const hit=own.find(r=>{const s=secondsOfDay(r.startedAt);return second>=s&&second<s+(r.duration||0);});if(hit)play(hit,second-secondsOfDay(hit.startedAt));else now.textContent='Sem gravação nesse horário.';};
   row.append(label,bar);timeline.append(row);
  }
  for(const r of records){
   const row=el('div',{},'padding:10px 12px;border:1px solid #1f2937;border-radius:10px;display:flex;flex-wrap:wrap;align-items:center;gap:10px;font-size:14px');
   const end=Date.parse(r.startedAt)+(r.duration||0)*1000,v=(r.streams||[]).find(s=>s.type==='video');
   row.append(el('span',{textContent:`${clock(r.startedAt)} – ${clock(end)} · ${viewOf(r.alias)} · ${v?.width?v.width+'×'+v.height+' · ':''}${size(r.bytes||0)}`},'flex:1;min-width:220px'),el('span',{textContent:labels[r.location]},`font-size:12px;color:${colors[r.location]}`));
   if(r.location!=='cloud'){const p=el('button',{textContent:'Assistir',className:'btn btn-sm btn-secondary'});p.onclick=()=>play(r);const d=el('a',{textContent:'Baixar original',href:`${BACKEND_API_BASE}/api/camera/archive/file?id=${r.id}&download=1`,className:'btn btn-sm btn-secondary'});row.append(p,d);}
   else{const d=el('button',{textContent:'Baixar da nuvem',className:'btn btn-sm btn-secondary'});d.onclick=()=>cloudDownload(r,d);row.append(d);}
   list.append(row);
  }
 }
 async function load(){
  status.textContent='Consultando gravações…';
  try{
   const r=await fetch('/api/camera/archive?day='+encodeURIComponent(day.value||dayOf(Date.now())));const d=await r.json();if(!r.ok)throw new Error(d.error||'NAS indisponível.');data=d;
   if(!d.enabled){status.textContent='O armazenamento no NAS ainda não está conectado.';return;}
   const chosen=day.value||dayOf(Date.now());day.replaceChildren(...[...new Set([dayOf(Date.now()),...(d.days||[])])].sort().reverse().map(x=>el('option',{value:x,textContent:new Date(x+'T12:00:00Z').toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric',timeZone:'UTC'})})));day.value=chosen;
   const cams=[...new Set([...d.recordings.map(x=>cameraOf(x.alias)),...Object.keys(d.status?.streams||{}).map(cameraOf)])].sort();const previous=camera.value||(active&&cams.find(c=>active.startsWith(c)))||cams[0];
   camera.replaceChildren(...cams.map(c=>el('option',{value:c,textContent:title(c)})));if(previous)camera.value=previous;
   const disk=d.status?.disk,b=d.backup;
   status.textContent=`${d.recordings.filter(x=>dayOf(x.startedAt)===day.value).length} arquivos neste dia · cada arquivo cobre até ${Math.round((d.status?.segmentSeconds||900)/60)} min, com vídeo e áudio originais.`;
   storage.textContent=[disk&&`NAS: ${size(disk.archiveBytes)} em gravações · ${size(disk.freeBytes)} livres de ${size(disk.totalBytes)} · as mais antigas saem ao atingir ${Math.round((d.status?.retention?.highWater||.9)*100)}%`,b&&(b.state==='awaiting_credentials'||b.state==='disabled'?'Backup na nuvem: aguardando configuração':`Backup na nuvem: ${b.records||0} arquivos, ${size(b.storedBytes||0)}`)].filter(Boolean).join(' · ');
   render();
  }catch(e){status.textContent=e.message;}
 }
 camera.onchange=render;day.onchange=load;await load();
};
