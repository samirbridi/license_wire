// Confirmação de placa para abertura do portão (REV: visão inteligente, 2026-10-31).
//
// Regra inegociável: a leitura de uma placa NUNCA abre o portão sozinha. Esta função só prepara uma
// solicitação pendente; o acionamento real passa sempre pela rota HTTP autenticada do portão
// (POST /api/gate/pulse via server.mjs -> executeGatePulse), com sessão de administrador, CSRF e um
// clique humano. Nada neste arquivo chama o motor do portão.
import {randomUUID} from 'node:crypto';

// Normaliza para comparar só letras/dígitos, sem hífen, maiúsculas. Aceita placa antiga (ABC1234) e
// Mercosul (ABC1D23); a mesma normalização serve para as duas.
export function normalizePlate(raw){
 return String(raw||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
}

export function createVehicleRegistry(vehicles){
 const byPlate=new Map(vehicles.map(v=>[normalizePlate(v.plate),v]));
 if(byPlate.size!==vehicles.length)throw new Error('Placas duplicadas no cadastro de veículos.');
 return{
  list:()=>vehicles.slice(),
  find:plate=>byPlate.get(normalizePlate(plate))||null,
 };
}

// Veículos cadastrados para abertura do portão por leitura de placa (proprietário, 2026-10-31).
// Mudar aqui NUNCA basta para liberar um carro: toda leitura ainda passa pela confirmação humana abaixo.
export const HOUSEHOLD_VEHICLES=[
 {id:'gwm_ora5', label:'GWM Ora 5', color:'Preto', plate:'TRL4I59'},
 {id:'byd_dolphin_mini', label:'BYD Dolphin Mini', color:'Preto', plate:'TQR1A36'},
 {id:'renault_scenic', label:'Renault Scénic', color:'Preta', plate:'IQL8380'},
];

const DEFAULT_TTL_MS=90_000; // tempo para a pessoa responder antes do pedido expirar sozinho
const DECIDED_RETENTION_MS=60*60*1000; // janela em que uma decisão continua consultável/auditável

// Fila de pedidos de abertura pendentes de confirmação humana. Em memória: um reinício do processo
// limpa qualquer pedido pendente, o que é o comportamento seguro (nunca reabrir um pedido antigo sozinho).
export function createPlateGateQueue({registry, ttlMs=DEFAULT_TTL_MS, now=Date.now}={}){
 const pending=new Map();
 function prune(){
  for(const [id,req] of pending){
   if(req.status==='pending'&&now()>req.expiresAt)pending.set(id,{...req,status:'expired',decidedAt:req.expiresAt});
   // Decididos (confirmado/recusado/expirado) somem depois de uma janela de retenção, não na hora: isso
   // mantém "já foi confirmada" e a consulta de status funcionando para um segundo clique ou outra pessoa
   // vendo a mesma notificação, sem crescer sem limite ao longo de uma sessão longa.
   else if(req.status!=='pending'&&now()-req.decidedAt>DECIDED_RETENTION_MS)pending.delete(id);
  }
 }
 return{
  // Chamado quando a visão computacional lê uma placa com confiança suficiente. Nunca aciona o portão;
  // devolve o pedido para a notificação ser exibida e aguardar decisão humana.
  request({plate, confidence, camera, snapshotPath, detectionId}){
   prune();
   if(!Number.isFinite(confidence)||confidence<0||confidence>1)throw new Error('Confiança de leitura inválida.');
   const vehicle=registry.find(plate);
   const id='plate_'+randomUUID().replaceAll('-','');
   const createdAt=now();
   const entry={id,plate:normalizePlate(plate),plateRaw:String(plate||''),confidence,camera,snapshotPath,detectionId,
    vehicle:vehicle?{id:vehicle.id,label:vehicle.label,color:vehicle.color}:null,
    known:!!vehicle,status:'pending',createdAt,expiresAt:createdAt+ttlMs,decidedAt:null,decidedBy:null};
   pending.set(id,entry);
   return entry;
  },
  get(id){prune();return pending.get(id)||null;},
  // Pedidos pendentes, para a notificação/listagem no portal. Nunca inclui decididos ou expirados.
  listPending(){prune();return[...pending.values()].filter(r=>r.status==='pending').sort((a,b)=>a.createdAt-b.createdAt);},
  // Confirmação explícita de uma pessoa autenticada. Devolve o pedido para o chamador decidir se aciona
  // o portão (sempre via a rota HTTP normal, nunca a partir daqui) — mantém a responsabilidade de acionar
  // fora deste módulo, junto da autenticação real.
  confirm(id,{by}={}){
   prune();const req=pending.get(id);
   if(!req)throw new Error('Solicitação não encontrada.');
   if(req.status==='expired')throw new Error('Solicitação expirada; peça nova leitura.');
   if(req.status!=='pending')throw new Error('Solicitação já foi '+(req.status==='confirmed'?'confirmada':'recusada')+'.');
   if(!by)throw new Error('Confirmação requer usuário autenticado.');
   req.status='confirmed';req.decidedAt=now();req.decidedBy=by;
   return req;
  },
  ignore(id,{by}={}){
   prune();const req=pending.get(id);
   if(!req)throw new Error('Solicitação não encontrada.');
   if(req.status==='pending'){req.status='ignored';req.decidedAt=now();req.decidedBy=by||null;}
   return req;
  },
 };
}
