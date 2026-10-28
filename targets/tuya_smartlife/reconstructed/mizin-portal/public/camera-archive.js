window.openNasArchive=async()=>{
 const dialog=document.createElement('dialog');dialog.style.cssText='width:min(1000px,92vw);max-height:88vh;overflow:auto;background:#0b1120;color:#e2e8f0;border:1px solid #334155;border-radius:20px;padding:24px;font-family:Outfit,sans-serif';
 const heading=document.createElement('h2');heading.textContent='Gravações no NAS';
 const close=document.createElement('button');close.textContent='Fechar';close.className='btn btn-secondary';close.onclick=()=>{video.pause();video.removeAttribute('src');video.load();dialog.close();dialog.remove();};
 const status=document.createElement('p');status.textContent='Consultando os arquivos…';status.setAttribute('role','status');
 const date=document.createElement('input');date.type='date';date.setAttribute('aria-label','Dia da gravação');date.className='form-input';
 const video=document.createElement('video');video.controls=true;video.playsInline=true;video.style.cssText='width:100%;max-height:48vh;margin-top:14px;background:black';
 const list=document.createElement('div');list.style.cssText='display:grid;gap:10px;margin-top:16px';
 dialog.append(heading,close,status,date,video,list);document.body.append(dialog);dialog.showModal();
 dialog.addEventListener('cancel',()=>close.click());
 try{
  const response=await fetch('/api/camera/archive');const data=await response.json();if(!response.ok)throw new Error(data.error||'NAS indisponível.');
  status.textContent=data.enabled?'Volume 4 · arquivo original com vídeo e áudio. A prévia usa uma cópia adaptada para o navegador.':'O armazenamento no NAS ainda não está conectado.';
  const active=typeof activePtzCam==='string'?activePtzCam:null;
  function render(){list.replaceChildren();const records=data.recordings.filter(r=>(!active||r.alias.startsWith(active.replace(/_view[12]$/,'')))&&(!date.value||new Date(r.startedAt).toLocaleDateString('en-CA')===date.value));
   if(!records.length){list.textContent='Nenhuma gravação encontrada para esta câmera e dia.';return;}
   for(const record of records){const row=document.createElement('div');row.style.cssText='padding:12px;border:1px solid #334155;border-radius:10px;display:flex;flex-wrap:wrap;align-items:center;gap:12px';const label=document.createElement('span');const v=record.streams.find(s=>s.type==='video');label.textContent=`${new Date(record.startedAt).toLocaleString('pt-BR')} · ${record.alias} · ${Math.round(record.duration)}s · ${v?.width}×${v?.height} · ${(record.bytes/1024**2).toFixed(1)} MB`;const play=document.createElement('button');play.textContent='Reproduzir';play.className='btn btn-sm btn-secondary';play.onclick=()=>{video.src=`${BACKEND_API_BASE}/api/camera/archive/file?id=${record.id}`;void video.play().catch(()=>{});};const download=document.createElement('a');download.textContent='Baixar original';download.href=`${BACKEND_API_BASE}/api/camera/archive/file?id=${record.id}&download=1`;download.className='btn btn-sm btn-secondary';row.append(label,play,download);list.append(row);}
  }date.onchange=render;render();
 }catch(error){status.textContent=error.message;}
};
