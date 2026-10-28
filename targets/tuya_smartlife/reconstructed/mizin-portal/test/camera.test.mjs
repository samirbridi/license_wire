import test from 'node:test';
import assert from 'node:assert/strict';
import {cameraMetadata} from '../camera-inventory.mjs';
import {createTalkback,opusPackets,encodeSpeech} from '../camera-talkback.mjs';
test('speech uses structured camera inventory independently of YAML formatting',()=>{
 const map=cameraMetadata([{alias:'camera',source:'xiaomi://123:cn@192.0.2.10?did=456&model=isa.camera.hlc7'}]);
 assert.equal(map.get('camera').did,'456');assert.equal(map.get('camera').region,'cn');
 assert.throws(()=>cameraMetadata([{alias:'camera',source:'https://example.com'}]));
});
test('unknown cameras and missing bridge acknowledgements cannot report speech success',async()=>{
 const missing=createTalkback({resolveCamera:()=>null,send:()=>assert.fail('unexpected bridge call')});
 await assert.rejects(()=>missing({cameraId:'unknown',action:'start'}));
 const service=createTalkback({resolveCamera:()=>({did:'456',model:'isa.camera.hlc7'}),send:async()=>({ok:true,framesSent:0,bytesSent:0}),encode:async()=>Buffer.alloc(320)});
 await assert.rejects(()=>service({cameraId:'camera',audio:Buffer.alloc(640),contentType:'audio/pcm;rate=8000'}),/não confirmou/);
});
test('speech requests await confirmed packets and retain per-camera order',async()=>{
 let release;const pending=new Promise(r=>release=r),calls=[];
 const service=createTalkback({resolveCamera:()=>({did:'456',model:'isa.camera.hlc7'}),encode:async()=>Buffer.alloc(320),send:async body=>{calls.push(body.action);if(calls.length===1)await pending;return{ok:true,framesSent:1,bytesSent:320};}});
 let completed=false;const first=service({cameraId:'camera',audio:Buffer.alloc(640)}).then(r=>{completed=true;return r;});
 const stop=service({cameraId:'camera',action:'stop'});await new Promise(r=>setImmediate(r));
 assert.equal(completed,false);assert.deepEqual(calls,['send']);release();
 const result=await first;await stop;assert.equal(result.bytesSent,320);assert.equal(result.backchannelStatus,'sent_to_camera');assert.deepEqual(calls,['send','stop']);
});
test('partial Ogg audio is rejected instead of transmitting a corrupt packet',()=>{assert.throws(()=>opusPackets(Buffer.from('OggS')));});
test('real PCM encoding yields Opus packets and 8kHz PCMA',{skip:!process.env.TEST_FFMPEG},async()=>{
 const pcm=Buffer.alloc(16000);for(let n=0;n<8000;n++)pcm.writeInt16LE(Math.round(1000*Math.sin(2*Math.PI*440*n/16000)),n*2);
 const opus=await encodeSpeech(process.env.TEST_FFMPEG,pcm,'audio/pcm;rate=16000',true);assert.ok(opusPackets(opus).length>=20);
 const pcma=await encodeSpeech(process.env.TEST_FFMPEG,pcm,'audio/pcm;rate=16000',false);assert.equal(pcma.length,4000);
});
