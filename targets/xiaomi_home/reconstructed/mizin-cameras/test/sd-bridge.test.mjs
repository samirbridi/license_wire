import test from 'node:test';
import assert from 'node:assert/strict';
import {dayStart,normalizeCatalog,createSDBridge} from '../sd-bridge.mjs';
test('catalog keeps real UTC epochs and separates Sao Paulo days from camera overlay',()=>{
  assert.equal(dayStart('2026-10-27'),Date.parse('2026-10-27T03:00:00Z')/1000);
  const rows=normalizeCatalog({catalogItems:[{startTime:1793102480,endTime:1793102540,motion:1}]});
  assert.equal(rows[0].start,1793102480);assert.equal(rows[0].motion,true);
  assert.throws(()=>normalizeCatalog({catalogItems:null}));assert.throws(()=>normalizeCatalog({catalogItems:[],catalogError:'timeout'}));
});
test('playback maps second lens to SD channel 10 and deletes only its temporary source',async()=>{
  const calls=[];
  const adapter=createSDBridge({upstream:'http://127.0.0.1:19843',cameras:[{id:'outdoor',name:'Outdoor',views:[{id:'one'},{id:'two'}]}],sources:[{name:'Outdoor',url:'xiaomi://123:cn@192.168.1.10?did=456&model=xiaomi.camera.cw701'}],fetcher:async(url,options={})=>{
    calls.push({url:new URL(url),options});return new Response(new URL(url).pathname.endsWith('storage')?JSON.stringify({status:0,catalogItems:[{startTime:1793102480,endTime:1793102540}]}):'');
  }});
  const state=await adapter.list('outdoor','two','2026-10-27');assert.equal(state.periods.length,1);assert.equal(calls[0].url.searchParams.get('channel'),'10');
  await assert.rejects(()=>adapter.open('outdoor','two',1793102480,1793102541));
  const playback=await adapter.open('outdoor','two',1793102485,1793102490);
  const source=new URL(calls.at(-1).url.searchParams.get('src'));assert.equal(source.searchParams.get('offset'),'5');assert.equal(source.searchParams.get('channel'),'10');
  await playback.close();await playback.close();assert.equal(calls.filter(c=>c.options.method==='DELETE').length,1);assert.equal(calls.at(-1).url.searchParams.get('src'),playback.alias);
  await assert.rejects(()=>adapter.list('unknown','two','2026-10-27'));
});
