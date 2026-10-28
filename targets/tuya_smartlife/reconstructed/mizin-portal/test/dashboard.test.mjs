import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';import {once} from 'node:events';import WebSocket from 'ws';import {createDashboardEvents,dashboardPaths} from '../dashboard-live.mjs';
test('an unavailable identity service rejects the socket without an unhandled upgrade rejection',async()=>{let destroyed=false;const events=createDashboardEvents({port:1,gate:{session:async()=>{throw new Error('offline');}}});try{await events.upgrade({headers:{}},{destroy(){destroyed=true;}},Buffer.alloc(0));assert.equal(destroyed,true);}finally{events.close();}});
test('one authenticated socket distributes dashboard reads and closes after account revocation',async()=>{
 let allowed=true,queries=0;const server=http.createServer((req,res)=>{queries++;res.writeHead(200,{'Content-Type':'application/json'});res.end(JSON.stringify({path:req.url}));});await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;
 const live=createDashboardEvents({port,gate:{session:async()=>allowed?{user:{role:'member'}}:null},intervalMs:30,authIntervalMs:10});server.on('upgrade',(req,socket,head)=>void live.upgrade(req,socket,head));
 const client=new WebSocket(`ws://127.0.0.1:${port}/api/dashboard/events`,{headers:{Origin:'https://homecams.pages.dev',Host:'homecams.pages.dev','x-forwarded-proto':'https'}});
 try{const[data]=await once(client,'message'),message=JSON.parse(data.toString());assert.equal(message.type,'snapshot');assert.deepEqual(Object.keys(message.responses),dashboardPaths);assert.equal(queries,6);allowed=false;const[code]=await once(client,'close');assert.equal(code,4401);}
 finally{client.terminate();live.close();await new Promise(r=>server.close(r));}
});
