import http from 'node:http';
import {WebSocketServer} from 'ws';
export const dashboardPaths=['/api/health','/api/energy','/api/devices','/api/logs','/api/config/ui','/api/ev/status'];
export function createDashboardEvents({port,gate,intervalMs=5000,authIntervalMs=30000}){
 const websocket=new WebSocketServer({noServer:true,maxPayload:2048,perMessageDeflate:false});
 function read(path,req){return new Promise((resolve,reject)=>{const headers={};for(const name of ['host','cookie','x-forwarded-proto','x-mizin-gateway','origin'])if(req.headers[name])headers[name]=req.headers[name];const call=http.get({host:'127.0.0.1',port,path,headers},reply=>{let text='',size=0;reply.on('data',chunk=>{size+=chunk.length;if(size>512*1024)reply.destroy(new Error('Resposta grande.'));else text+=chunk;});reply.on('error',reject);reply.on('end',()=>{try{resolve({status:reply.statusCode,data:JSON.parse(text)});}catch{reject(new Error('Resposta inválida.'));}});});call.setTimeout(8000,()=>call.destroy(new Error('Consulta indisponível.')));call.on('error',reject);});}
 async function upgrade(req,socket,head){
  let session;try{session=await gate.session(req);}catch{socket.destroy();return;}if(!session?.user||session.user.mustChangePassword||req.headers.origin!==req.headers['x-forwarded-proto']+'://'+req.headers.host){socket.destroy();return;}
  websocket.handleUpgrade(req,socket,head,ws=>{
   let busy=false,hidden=false,lastAuth=Date.now();
   const tick=async()=>{if(busy||ws.readyState!==1||ws.bufferedAmount>512*1024)return;busy=true;try{
    if(Date.now()-lastAuth>authIntervalMs){const current=await gate.session(req);if(!current?.user||current.user.mustChangePassword){ws.close(4401,'Entre novamente.');return;}lastAuth=Date.now();}
    if(hidden)return;const entries=await Promise.all(dashboardPaths.map(async path=>[path,await read(path,req)]));ws.send(JSON.stringify({type:'snapshot',at:Date.now(),responses:Object.fromEntries(entries)}));
   }catch{if(ws.readyState===1)ws.send(JSON.stringify({type:'unavailable'}));}finally{busy=false;}};
   ws.on('message',raw=>{try{const message=JSON.parse(raw.toString());if(message.type==='visibility')hidden=message.hidden===true;if(message.type==='ping'&&Number.isFinite(message.at))ws.send(JSON.stringify({type:'pong',at:message.at}));}catch{ws.close(1008,'Mensagem inválida.');}});
   const timer=setInterval(()=>void tick(),intervalMs);ws.on('close',()=>clearInterval(timer));void tick();
  });
 }
 return{upgrade,close:()=>{for(const client of websocket.clients)client.close();websocket.close();}};
}
