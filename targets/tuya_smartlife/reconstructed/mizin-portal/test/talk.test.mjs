import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {WebSocket} from 'ws';
import {createTalkStream, createOggOpusReader} from '../camera-talk-stream.mjs';

const ffmpeg = process.env.TEST_FFMPEG;

// Synthetic 440 Hz tone, 16 kHz mono s16le, cut in 64 ms blocks like the panel sends.
function toneBlocks(seconds) {
 const blocks = [];
 for (let start = 0; start < seconds * 16000; start += 1024) {
  const pcm = Buffer.alloc(2048);
  for (let i = 0; i < 1024; i++) pcm.writeInt16LE(Math.round(Math.sin(2 * Math.PI * 440 * (start + i) / 16000) * 8000), i * 2);
  blocks.push(pcm);
 }
 return blocks;
}

test('Ogg reader hands out packets split across chunks', () => {
 const packets = [];
 const read = createOggOpusReader(p => packets.push(p.toString()));
 const page = (...segments) => {
  const header = Buffer.alloc(27); header.write('OggS'); header[26] = segments.length;
  return Buffer.concat([header, Buffer.from(segments.map(s => s.length)), ...segments.map(s => Buffer.from(s))]);
 };
 const stream = Buffer.concat([page('OpusHead'), page('OpusTags'), page('aa', 'bbb'), page('c')]);
 for (let i = 0; i < stream.length; i += 5) read(stream.subarray(i, i + 5));
 assert.deepEqual(packets, ['aa', 'bbb', 'c']);
});

test('one WebSocket talk reaches the bridge as a steady Opus stream', {skip: !ffmpeg && 'TEST_FFMPEG not set'}, async () => {
 let frames = 0, firstFrameAt = 0, lastFrameAt = 0, speakerOpened = 0;
 const bridge = http.createServer((req, res) => {
  assert.match(req.url, /^\/api\/xiaomi\/talkstream\?.*codec=opus/);
  let buf = Buffer.alloc(0);
  req.on('data', chunk => {
   buf = Buffer.concat([buf, chunk]);
   while (buf.length >= 2 && buf.length >= 2 + buf.readUInt16BE(0)) {
    const size = buf.readUInt16BE(0);
    assert.ok(size > 0 && size < 400, `opus packet of ${size} bytes`);
    buf = buf.subarray(2 + size);
    frames++;
    lastFrameAt = Date.now();
    firstFrameAt ||= lastFrameAt;
   }
  });
  req.on('end', () => { res.writeHead(200, {'Content-Type': 'application/json'}); res.end(JSON.stringify({ok: true, framesSent: frames / 2})); });
 });
 await new Promise(r => bridge.listen(0, '127.0.0.1', r));
 const talk = createTalkStream({ffmpeg, bridgePort: bridge.address().port,
  resolveCamera: () => ({did: 'd', model: 'xiaomi.camera.cw701'}),
  openSpeaker: async () => { speakerOpened++; return {ok: true, speakerAnswer: '0'}; }});
 const portal = http.createServer();
 portal.on('upgrade', (req, socket, head) => talk.upgrade(req, socket, head, 'cam'));
 await new Promise(r => portal.listen(0, '127.0.0.1', r));

 const ws = new WebSocket(`ws://127.0.0.1:${portal.address().port}/api/camera/talk-ws?id=cam`);
 const ready = await new Promise((resolve, reject) => {
  ws.on('message', data => { const msg = JSON.parse(data.toString()); if (msg.type === 'ready') resolve(msg); else reject(new Error(msg.error)); });
  ws.on('error', reject);
 });
 assert.equal(ready.codec, 'opus');
 assert.equal(speakerOpened, 1, 'speaker channel opened before any audio');
 const started = Date.now();
 for (const block of toneBlocks(2)) { ws.send(block); await new Promise(r => setTimeout(r, 64)); }
 // Frames flow while the talk is still going on, not only when it ends.
 assert.ok(firstFrameAt && firstFrameAt - started < 1000, 'first frame within 1 s');
 ws.close();
 await new Promise(r => { const t = setInterval(() => { if (Date.now() - lastFrameAt > 500 && frames) { clearInterval(t); r(); } }, 100); });
 assert.ok(frames >= 90 && frames <= 105, `about 100 packets of 20 ms for 2 s, got ${frames}`);
 talk.close(); portal.close(); bridge.close();
});
