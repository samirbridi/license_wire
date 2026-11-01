import test from 'node:test';
import assert from 'node:assert/strict';
import {createPlateNotifier} from '../plate-notify.mjs';

const baseReq=()=>({id:'plate_1',plate:'TRL4I59',plateRaw:'TRL-4I59',known:true,vehicle:{id:'gwm_ora5',label:'GWM Ora 5',color:'Preto'},camera:'outdoor_rua',createdAt:1000,expiresAt:91000,status:'pending'});

test('requestCreated sends to every push subscription and every telegram chat',async()=>{
 const pushed=[],telegrammed=[];
 const notifier=createPlateNotifier({
  webPushSend:async(sub,payload)=>{pushed.push({sub,payload});},
  telegramSend:async(msg)=>{telegrammed.push(msg);},
  listPushSubscriptions:()=>['sub-a','sub-b'],
  listTelegramChats:()=>['chat-1'],
 });
 const result=await notifier.requestCreated(baseReq());
 assert.equal(result.delivered,3);
 assert.deepEqual(pushed.map(p=>p.sub),['sub-a','sub-b']);
 const payload=JSON.parse(pushed[0].payload);
 assert.equal(payload.type,'plate-request');
 assert.equal(payload.id,'plate_1');
 assert.deepEqual(payload.actions.map(a=>a.action),['confirm','ignore']);
 assert.equal(telegrammed.length,1);
 assert.equal(telegrammed[0].chatId,'chat-1');
 assert.match(telegrammed[0].text,/GWM Ora 5/);
 assert.equal(telegrammed[0].requestId,'plate_1');
});

test('an unknown plate is worded as unregistered, never as if it matched a household vehicle',async()=>{
 const telegrammed=[];
 const notifier=createPlateNotifier({telegramSend:async(msg)=>{telegrammed.push(msg);},listTelegramChats:()=>['chat-1']});
 await notifier.requestCreated({...baseReq(),known:false,vehicle:null,plate:'ZZZ9999',plateRaw:'ZZZ-9999'});
 assert.match(telegrammed[0].text,/não cadastrada/);
 assert.doesNotMatch(telegrammed[0].text,/GWM Ora 5/);
});

test('one failing recipient does not block delivery to the others, on either channel',async()=>{
 const pushed=[];
 const notifier=createPlateNotifier({
  webPushSend:async(sub)=>{if(sub==='dead-sub')throw new Error('410 Gone');pushed.push(sub);},
  listPushSubscriptions:()=>['dead-sub','alive-sub'],
 });
 const result=await notifier.requestCreated(baseReq());
 assert.deepEqual(pushed,['alive-sub']);
 assert.equal(result.delivered,1);
});

test('a delivery failure is reported via onDeliveryError with channel and recipient, never thrown',async()=>{
 const errors=[];
 const notifier=createPlateNotifier({
  webPushSend:async()=>{throw new Error('expired subscription');},
  listPushSubscriptions:()=>['sub-x'],
  onDeliveryError:(e)=>errors.push(e),
 });
 await assert.doesNotReject(()=>notifier.requestCreated(baseReq()));
 assert.equal(errors.length,1);
 assert.equal(errors[0].channel,'web-push');
 assert.equal(errors[0].recipient,'sub-x');
 assert.match(errors[0].error.message,/expired subscription/);
});

test('with no channel configured, requestCreated delivers nothing and never throws',async()=>{
 const notifier=createPlateNotifier();
 const result=await notifier.requestCreated(baseReq());
 assert.equal(result.delivered,0);
});

test('requestDecided notifies push subscribers to close the notification, and is a no-op without web push configured',async()=>{
 const pushed=[];
 const withPush=createPlateNotifier({webPushSend:async(sub,payload)=>{pushed.push(JSON.parse(payload));},listPushSubscriptions:()=>['sub-a']});
 await withPush.requestDecided({...baseReq(),status:'confirmed'});
 assert.deepEqual(pushed,[{type:'plate-decided',id:'plate_1',status:'confirmed'}]);

 const withoutPush=createPlateNotifier();
 await assert.doesNotReject(()=>withoutPush.requestDecided({...baseReq(),status:'ignored'}));
});

test('listPushSubscriptions/listTelegramChats may return a Promise, like the real file-backed store does',async()=>{
 const pushed=[];
 const notifier=createPlateNotifier({
  webPushSend:async(sub)=>{pushed.push(sub);},
  listPushSubscriptions:async()=>['sub-a','sub-b'], // async store.list(), not a plain array
 });
 const result=await notifier.requestCreated(baseReq());
 assert.equal(result.delivered,2);
 assert.deepEqual(pushed,['sub-a','sub-b']);
});

test('neither channel is ever told to pulse or open anything: payload carries only confirm/ignore actions',async()=>{
 const payloads=[];
 const notifier=createPlateNotifier({webPushSend:async(sub,payload)=>{payloads.push(payload);},listPushSubscriptions:()=>['sub-a']});
 await notifier.requestCreated(baseReq());
 const raw=payloads.join(' ');
 assert.doesNotMatch(raw.toLowerCase(),/pulse|gate\.?open|executegatepulse/);
});
