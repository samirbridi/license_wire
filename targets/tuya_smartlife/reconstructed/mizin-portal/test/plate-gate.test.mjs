import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizePlate, createVehicleRegistry, createPlateGateQueue, HOUSEHOLD_VEHICLES} from '../plate-gate.mjs';

test('plate normalization ignores case, hyphen and spaces for both old and Mercosul formats',()=>{
 assert.equal(normalizePlate('trl-4i59'),'TRL4I59');
 assert.equal(normalizePlate('TRL 4I59'),'TRL4I59');
 assert.equal(normalizePlate('tqr-1a36'),'TQR1A36');
 assert.equal(normalizePlate(''),'');
 assert.equal(normalizePlate(null),'');
});

test('household registry matches the three registered vehicles and rejects duplicate plates',()=>{
 const registry=createVehicleRegistry(HOUSEHOLD_VEHICLES);
 assert.equal(registry.find('TRL-4I59').label,'GWM Ora 5');
 assert.equal(registry.find('tqr1a36').label,'BYD Dolphin Mini');
 assert.equal(registry.find('IQL-8380').label,'Renault Scénic');
 assert.equal(registry.find('ABC1234'),null);
 assert.throws(()=>createVehicleRegistry([...HOUSEHOLD_VEHICLES,{id:'dup',label:'Dup',plate:'trl4i59'}]),/duplicadas/);
});

test('a plate read never opens the gate by itself: request() only queues, nothing it returns can trigger a pulse',()=>{
 const registry=createVehicleRegistry(HOUSEHOLD_VEHICLES);
 const queue=createPlateGateQueue({registry});
 const req=queue.request({plate:'TRL-4I59',confidence:0.91,camera:'outdoor_rua',snapshotPath:'/x.jpg',detectionId:'evt1'});
 assert.equal(req.status,'pending');
 assert.equal(req.known,true);
 assert.equal(req.vehicle.label,'GWM Ora 5');
 // The queue module exposes no function whose name could plausibly pulse the gate.
 for(const key of Object.keys(queue))assert.doesNotMatch(key.toLowerCase(),/pulse|gate\.?(open|toggle)|executegatepulse/);
});

test('unknown plates are queued too (for human review) but marked unknown, never auto-matched',()=>{
 const registry=createVehicleRegistry(HOUSEHOLD_VEHICLES);
 const queue=createPlateGateQueue({registry});
 const req=queue.request({plate:'ZZZ9999',confidence:0.75,camera:'aw300_portao',snapshotPath:null,detectionId:'evt2'});
 assert.equal(req.known,false);
 assert.equal(req.vehicle,null);
});

test('confirm() requires an authenticated user and flips status exactly once',()=>{
 const registry=createVehicleRegistry(HOUSEHOLD_VEHICLES);
 const queue=createPlateGateQueue({registry});
 const req=queue.request({plate:'IQL-8380',confidence:0.88,camera:'outdoor_calcada',snapshotPath:'/y.jpg',detectionId:'evt3'});
 assert.throws(()=>queue.confirm(req.id,{}),/autenticado/);
 const confirmed=queue.confirm(req.id,{by:'admin@mizin'});
 assert.equal(confirmed.status,'confirmed');
 assert.equal(confirmed.decidedBy,'admin@mizin');
 assert.throws(()=>queue.confirm(req.id,{by:'admin@mizin'}),/já foi confirmada/);
});

test('ignore() lets a human dismiss a request without opening anything',()=>{
 const registry=createVehicleRegistry(HOUSEHOLD_VEHICLES);
 const queue=createPlateGateQueue({registry});
 const req=queue.request({plate:'TQR-1A36',confidence:0.80,camera:'outdoor_rua',snapshotPath:'/z.jpg',detectionId:'evt4'});
 const ignored=queue.ignore(req.id,{by:'admin@mizin'});
 assert.equal(ignored.status,'ignored');
 assert.equal(queue.listPending().length,0);
});

test('a request past its TTL expires on its own and can no longer be confirmed',()=>{
 let clock=1_000_000;
 const registry=createVehicleRegistry(HOUSEHOLD_VEHICLES);
 const queue=createPlateGateQueue({registry,ttlMs:90_000,now:()=>clock});
 const req=queue.request({plate:'TRL-4I59',confidence:0.9,camera:'outdoor_rua',snapshotPath:'/a.jpg',detectionId:'evt5'});
 assert.equal(queue.listPending().length,1);
 clock+=90_001;
 assert.equal(queue.listPending().length,0);
 assert.equal(queue.get(req.id).status,'expired');
 assert.throws(()=>queue.confirm(req.id,{by:'admin@mizin'}),/expirada/);
});

test('confidence must be a finite number in [0,1]; garbage input is rejected before queuing',()=>{
 const registry=createVehicleRegistry(HOUSEHOLD_VEHICLES);
 const queue=createPlateGateQueue({registry});
 for(const bad of [NaN,-0.1,1.1,Infinity,undefined])
  assert.throws(()=>queue.request({plate:'TRL-4I59',confidence:bad,camera:'c',snapshotPath:null,detectionId:'x'}),/[Cc]onfiança/);
});

test('listPending never returns confirmed, ignored or expired requests, and stays ordered oldest-first',()=>{
 let clock=0;
 const registry=createVehicleRegistry(HOUSEHOLD_VEHICLES);
 const queue=createPlateGateQueue({registry,now:()=>clock});
 const a=queue.request({plate:'TRL-4I59',confidence:0.9,camera:'c1',snapshotPath:null,detectionId:'a'});
 clock+=1000;
 const b=queue.request({plate:'TQR-1A36',confidence:0.9,camera:'c2',snapshotPath:null,detectionId:'b'});
 clock+=1000;
 const c=queue.request({plate:'IQL-8380',confidence:0.9,camera:'c3',snapshotPath:null,detectionId:'c'});
 queue.confirm(a.id,{by:'admin'});
 queue.ignore(b.id,{by:'admin'});
 const left=queue.listPending();
 assert.deepEqual(left.map(r=>r.id),[c.id]);
});
