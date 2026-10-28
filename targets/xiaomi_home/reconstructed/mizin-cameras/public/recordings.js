import { dayInMonth, moveDay, seekRecorded } from './recordings-core.js';
export class RecordingsPanel {
  constructor(api) {
    this.api = api; this.dialog = document.querySelector('#recordings-dialog'); this.requestId = 0;
    this.video=document.querySelector('#recording-video'); this.view=document.querySelector('#recording-view');
    this.seek=document.querySelector('#recording-seek'); this.clock=document.querySelector('#recording-time');
    this.format=new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    this.view.onchange=()=>this.load();
    this.seek.oninput=()=>{this.clock.value=this.time(Number(this.seek.value));};
    this.seek.onchange=()=>this.play(Number(this.seek.value));
    this.clock.onchange=()=>this.play(this.seconds(this.clock.value));
    document.querySelector('#recording-zoom').onchange=()=>this.draw();
    document.querySelector('#download-clip').onclick=()=>this.download();
    this.video.addEventListener('timeupdate',()=>{if(this.playingAt){const at=Math.floor(this.playingAt+this.video.currentTime);this.seek.value=String(at);this.clock.value=this.time(at);}});
    this.video.addEventListener('error',()=>{document.querySelector('#recording-status').textContent='Não foi possível abrir este trecho. Selecione outro horário ou tente novamente.';});
    this.dialog.addEventListener('close',()=>{this.stop();this.requestId++;this.camera=null;});
    this.day = document.querySelector('#recording-day'); this.month = document.querySelector('#recording-month');
    this.day.value = new Intl.DateTimeFormat('sv-SE', { timeZone: 'America/Sao_Paulo' }).format(new Date());
    this.month.value = this.day.value.slice(0, 7);
    this.day.onchange = () => { this.month.value = this.day.value.slice(0, 7); this.load(); };
    this.month.onchange = () => { if (!this.month.value) return; try { this.day.value = dayInMonth(this.month.value, this.day.value.slice(8)); this.load(); } catch (error) { document.querySelector('#recording-status').textContent = error.message; } };
    document.querySelector('#recording-prev').onclick = () => this.step(-1);
    document.querySelector('#recording-next').onclick = () => this.step(1);
    document.querySelector('#close-recordings').onclick = () => this.close();
  }
  open(camera) { this.camera = camera; this.view.replaceChildren();for(const view of camera.views){const option=document.createElement('option');option.value=view.id;option.textContent=view.label;this.view.append(option);}this.view.parentElement.hidden=camera.views.length<2; document.querySelector('#recordings-title').textContent = camera.name; if (!this.dialog.open) this.dialog.showModal(); this.load(); }
  step(offset) { if (!this.day.value) return; this.day.value = moveDay(this.day.value, offset); this.month.value = this.day.value.slice(0, 7); this.load(); }
  async load() {
    if (!this.camera || !this.day.value) return;
    this.stop();this.state=null;
    const camera = this.camera, date = this.day.value, requestId = ++this.requestId,view=this.view.value;
    document.querySelector('#recording-status').textContent = 'Consultando disponibilidade…';
    document.querySelector('#recording-seek').disabled = true; document.querySelector('#download-clip').disabled = true;
    document.querySelector('#timeline-empty').textContent = 'Consultando disponibilidade…';
    this.clock.disabled=true;document.querySelector('#clip-start').disabled=true;document.querySelector('#clip-end').disabled=true;
    document.querySelector('#recording-timeline').getContext('2d').clearRect(0,0,1200,32);
    try {
      const state = await this.api(`/api/recordings/${camera.id}?date=${date}&view=${encodeURIComponent(view)}`);
      if (this.requestId !== requestId || this.camera !== camera || this.day.value !== date) return;
      this.state=state;
      document.querySelector('#recording-status').textContent = state.status === 'ready' ? `${state.periods.length} arquivos neste dia.${state.cardStatus===3?' A câmera informou erro no cartão.':''}` : 'O acesso às gravações do cartão ainda está em preparação.';
      document.querySelector('#timeline-empty').textContent = state.periods === null ? 'Disponibilidade do cartão ainda não consultada' : state.periods.length ? 'Toque na linha do tempo ou escolha um horário.' : 'Nenhuma gravação neste dia';
      document.querySelector('#recording-seek').disabled = state.status !== 'ready' || !state.periods?.length;
      document.querySelector('#download-clip').disabled = !state.capabilities.export||!state.periods?.length;
      this.clock.disabled=!state.periods?.length;
      const days=document.querySelector('#recording-days');days.replaceChildren();
      for(const day of (state.availableDays??[]).filter(d=>d.startsWith(this.month.value))){const b=document.createElement('button');b.className='text-button';b.textContent=day.slice(8);b.setAttribute('aria-label','Gravações de '+day);b.onclick=()=>{this.day.value=day;this.load();};days.append(b);}
      if(state.periods?.length){const at=Math.max(state.dayStart,state.periods[0].start);this.clock.value=this.time(at);this.draw(at);this.seek.value=String(at);this.selectClip(at);}
    } catch (error) { if (this.requestId === requestId && this.camera === camera && this.day.value === date) document.querySelector('#recording-status').textContent = error.message; }
  }
  time(at){return this.format.format(new Date(at*1000));}
  seconds(clock){const parts=clock.split(':').map(Number);return this.state.dayStart+parts[0]*3600+parts[1]*60+(parts[2]??0);}
  draw(center=Number(this.seek.value)){
    if(!this.state?.periods)return;
    const width=Number(document.querySelector('#recording-zoom').value)*3600;
    const min=Math.max(this.state.dayStart,Math.min(center-width/2,this.state.dayEnd-width)),max=Math.min(this.state.dayEnd,min+width);
    this.seek.min=String(min);this.seek.max=String(max-1);if(center<min||center>=max)this.seek.value=String(min);
    document.querySelector('#timeline-start').textContent=this.time(min);document.querySelector('#timeline-end').textContent=this.time(max-1);
    const canvas=document.querySelector('#recording-timeline'),context=canvas.getContext('2d');context.clearRect(0,0,canvas.width,canvas.height);
    for(const p of this.state.periods){const a=Math.max(min,p.start),b=Math.min(max,p.end);if(b<=a)continue;context.fillStyle=p.motion?'#f6c36a':'#66d7bd';context.fillRect((a-min)/(max-min)*canvas.width,2,Math.max(1,(b-a)/(max-min)*canvas.width),28);}
  }
  selectClip(at){const entry=this.state.periods.find(p=>p.start<=at&&at<p.end);if(!entry)return;const end=Math.min(entry.end,at+30,this.state.dayEnd-1);document.querySelector('#clip-start').value=this.time(at);document.querySelector('#clip-end').value=this.time(end);document.querySelector('#clip-start').disabled=false;document.querySelector('#clip-end').disabled=false;}
  play(value){if(!this.state?.periods?.length)return;const at=seekRecorded(this.state.periods,Math.floor(value));if(at===null)return;this.stop();this.playingAt=at;this.seek.value=String(at);this.clock.value=this.time(at);this.selectClip(at);this.video.hidden=false;this.video.src=`/api/replay/${this.camera.id}?view=${encodeURIComponent(this.view.value)}&at=${at}&quality=balanced`;this.video.load();this.video.play().catch(()=>{});}
  async download(){
    if(!this.state)return;
    const at=this.seconds(document.querySelector('#clip-start').value),end=this.seconds(document.querySelector('#clip-end').value);
    const entry=this.state.periods.find(p=>p.start<=at&&at<p.end),status=document.querySelector('#recording-status');
    if(!entry||!Number.isFinite(end)||end<=at||end>entry.end||end-at>60){status.textContent='Escolha até 60 segundos dentro do mesmo arquivo. Ajuste os horários do trecho.';return;}
    this.stop();const controller=new AbortController();this.downloadController=controller;
    const button=document.querySelector('#download-clip');button.disabled=true;status.textContent='Preparando o arquivo para baixar…';
    const timer=setTimeout(()=>controller.abort(),100000);
    try{
      const response=await fetch(`/api/clip/${this.camera.id}?view=${encodeURIComponent(this.view.value)}&at=${at}&end=${end}&quality=original`,{signal:controller.signal,cache:'no-store'});
      if(!response.ok)throw new Error('Não foi possível exportar este trecho. Tente novamente.');
      const data=await response.blob();if(!data.size||data.type!=='video/mp4')throw new Error('A câmera não retornou um vídeo válido.');
      const url=URL.createObjectURL(data),link=document.createElement('a');link.href=url;link.download=`${this.camera.id}-${at}.mp4`;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
      status.textContent='Arquivo preparado e enviado para download.';
    }catch(error){if(this.dialog.open)status.textContent=error.name==='AbortError'?'Exportação interrompida. Tente novamente.':error.message;}
    finally{clearTimeout(timer);if(this.downloadController===controller){this.downloadController=null;button.disabled=false;}}
  }
  stop(){this.downloadController?.abort();this.playingAt=null;this.video.pause();this.video.removeAttribute('src');this.video.load();}
  close() { this.requestId++; this.stop();this.camera = null; if (this.dialog.open) this.dialog.close(); }
}
