import {timingSafeEqual} from 'node:crypto';
import http from 'node:http';
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
export function privateAuthFetch(url,{method='GET',headers={},body}={}){
 const address=new URL(url);if(address.protocol!=='http:'||address.hostname!=='127.0.0.1')throw new Error('Autenticação deve permanecer local.');
 return new Promise((accept,reject)=>{
  const request=http.request(address,{method,headers},reply=>{const chunks=[];let size=0;reply.on('data',chunk=>{size+=chunk.length;if(size>262144)reply.destroy(new Error('Resposta de autenticação muito grande.'));else chunks.push(chunk);});reply.on('error',reject);reply.on('end',()=>accept(new Response(Buffer.concat(chunks),{status:reply.statusCode,headers:reply.headers})));});
      request.setTimeout(5000,()=>request.destroy(new Error('Autenticação indisponível.')));request.on('error',reject);request.end(body);
 });
}
export function createPortalGate({origin,gatewayToken,auth='http://127.0.0.1:19846',fetcher=privateAuthFetch}){
 const hostname=new URL(origin).host;
 function trusted(req){return req.headers.host===hostname&&req.headers['x-forwarded-proto']==='https'&&same(req.headers['x-mizin-gateway'],gatewayToken);}
 function headers(req){const out={'host':hostname,'x-forwarded-proto':'https','x-mizin-gateway':gatewayToken};for(const k of ['cookie','origin','content-type','x-csrf-token','x-mizin-client-ip'])if(req.headers[k])out[k]=req.headers[k];return out;}
 async function session(req){if(!trusted(req))return null;const result=await fetcher(auth+'/api/session',{headers:headers(req),signal:AbortSignal.timeout(5000)});return result.ok?result.json():null;}
 async function protect(req,res){
  const fail=(code,error)=>{res.writeHead(code,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({error}));return false;};
  if(!trusted(req))return fail(403,'Passagem privada não autorizada.');
  const pathname=new URL(req.url,origin).pathname;
  if(['/api/session','/api/logout'].includes(pathname)||pathname.startsWith('/api/auth/')){
   let body; if(req.method==='POST'){const parts=[];let size=0;for await(const c of req){size+=c.length;if(size>32768)return fail(413,'Requisição muito grande.');parts.push(c);}body=Buffer.concat(parts);}
   const reply=await fetcher(auth+pathname+new URL(req.url,origin).search,{method:req.method,headers:headers(req),body,signal:AbortSignal.timeout(5000)});
   res.writeHead(reply.status,Object.fromEntries(reply.headers));res.end(Buffer.from(await reply.arrayBuffer()));return false;
  }
  // Ingestão de leitura de placa (plate-watcher.mjs), webhook do Telegram e a ponte MQTT para o Home
  // Assistant (mqtt-bridge-runner.mjs): nenhuma tem uma sessão de navegador para apresentar -- a
  // primeira e a última são processos/scripts, a segunda é o próprio Telegram chamando de fora. Cada
  // uma é autenticada por seu próprio segredo fixo, verificado pelo handler da rota em server.mjs
  // (vision-ingest-auth.mjs / secret_token / mqtt-bridge-token), não aqui — isto só troca a exigência
  // de sessão humana por essa verificação alternativa, só para estas rotas. trusted(req) acima continua
  // obrigatório: a chamada ainda precisa ter vindo mesmo pelo Worker Cloudflare real.
  if((pathname==='/api/vision/plate-event'||pathname==='/api/vision/telegram-webhook'||pathname==='/api/mqtt-bridge/command')&&req.method==='POST')return true;
  if(pathname==='/api/mqtt-bridge/devices'&&req.method==='GET')return true;
  let data;try{data=await session(req);}catch{return fail(503,'Autenticação temporariamente indisponível.');}
  if(!data)return fail(401,'Entre com sua conta cadastrada.');
  if(data.user?.mustChangePassword)return fail(403,'Defina uma nova senha no painel da sua conta.');
  const role=data.user?.role;
  if(!['admin','member'].includes(role))return fail(401,'Entre com sua conta cadastrada.');
  if(role!=='admin'){
   const read=/^\/api\/(?:health|devices|cameras|camera-frame|camera-stream|energy(?:\/history|\/trends|\/tariff)?|ev\/status|gate\/status|gate\/plate-requests|scenes|schedules|automations|logs|config\/(?:ui|shortcuts)|portal\/shell|camera\/(?:archive(?:\/file)?|recordings(?:\/stream|\/clip)?))$/.test(pathname)&&['GET','HEAD'].includes(req.method);
   // Confirmar/ignorar um pedido de placa tem a mesma confiança que o botão comum de abrir o portão
   // (gate/pulse) logo abaixo: qualquer membro da família pode decidir, nunca só o administrador.
   const use=req.method==='POST'&&(/^\/api\/(?:control|gate\/pulse|doorbell\/trigger|logs\/mark-read|ev\/command|camera\/(?:ptz|zoom|light|siren|talkback|recordings\/speed)|device\/[a-zA-Z0-9_-]+\/toggle|(?:scenes|automations)\/[a-zA-Z0-9_-]+\/execute|energy\/history\/month|gate\/plate-requests\/[a-zA-Z0-9_-]+\/(?:confirm|ignore)|vision\/push-(?:subscribe|unsubscribe)|vision\/telegram-link-code)$/.test(pathname));
   if(!read&&!use)return fail(403,'Somente o administrador pode alterar configurações.');
  }
  const mutation=!['GET','HEAD'].includes(req.method)||/\/api\/(?:control|camera\/(?:ptz|zoom|patrol|preset))/.test(pathname);
  if(mutation&&(!same(req.headers['x-csrf-token'],data.csrf)||req.headers.origin!==origin))return fail(403,'Comando não autorizado.');
  return true;
 }
 return{protect,session,trusted};
}
