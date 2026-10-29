// Push-to-talk over one WebSocket per talk: the browser sends 16 kHz mono PCM, one ffmpeg encodes the whole
// talk (no encoder restart per block, so no clicks), and one streaming request carries the frames to the
// bridge, which paces them to the camera (api/xiaomi/talkstream). Replaces one HTTP request per 256 ms block,
// whose queue dropped blocks and cut the voice.
import {spawn} from 'node:child_process';
import http from 'node:http';
import {WebSocketServer} from 'ws';

// Incremental Ogg reader: hands out Opus packets as pages arrive (headers OpusHead/OpusTags skipped).
export function createOggOpusReader(onPacket) {
 let buffer = Buffer.alloc(0), parts = [];
 return chunk => {
  buffer = buffer.length ? Buffer.concat([buffer, chunk]) : chunk;
  for (;;) {
   if (buffer.length < 27) return;
   if (buffer.toString('ascii', 0, 4) !== 'OggS') throw new Error('Contêiner de áudio inválido.');
   const count = buffer[26], table = 27;
   if (buffer.length < table + count) return;
   let size = 0;
   for (let i = 0; i < count; i++) size += buffer[table + i];
   if (buffer.length < table + count + size) return;
   let cursor = table + count;
   for (let i = 0; i < count; i++) {
    const len = buffer[table + i];
    parts.push(buffer.subarray(cursor, cursor + len));
    cursor += len;
    if (len < 255) {
     const packet = Buffer.concat(parts);
     parts = [];
     const magic = packet.subarray(0, 8).toString('ascii');
     if (packet.length && magic !== 'OpusHead' && magic !== 'OpusTags') onPacket(packet);
    }
   }
   buffer = buffer.subarray(cursor);
  }
 };
}

export function opusModel(model) {
 return ['xiaomi.camera.cw701', 'mxiang.camera.mod11'].includes(model);
}

export function talkEncoderArgs(opus) {
 const input = ['-hide_banner', '-nostdin', '-loglevel', 'error', '-f', 's16le', '-ar', '16000', '-ac', '1', '-i', 'pipe:0'];
 // One Ogg page per 20 ms packet and immediate flushes: frames leave as soon as they are encoded.
 return opus
  ? [...input, '-c:a', 'libopus', '-ar', '16000', '-ac', '1', '-b:a', '24k', '-vbr', 'off', '-frame_duration', '20', '-application', 'voip', '-flush_packets', '1', '-page_duration', '20000', '-f', 'ogg', 'pipe:1']
  : [...input, '-c:a', 'pcm_alaw', '-ar', '8000', '-ac', '1', '-flush_packets', '1', '-f', 'alaw', 'pipe:1'];
}

export function createTalkStream({ffmpeg, resolveCamera, openSpeaker, bridgePort = 19843, spawnProcess = spawn, maxSeconds = 600}) {
 const wss = new WebSocketServer({noServer: true, maxPayload: 256 * 1024, perMessageDeflate: false});

 async function upgrade(req, socket, head, cameraId) {
  const meta = resolveCamera(cameraId);
  if (!meta?.did) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => run(ws, meta).catch(() => { try { ws.close(); } catch {} }));
 }

 async function run(ws, meta) {
  const tell = msg => { if (ws.readyState === 1) ws.send(JSON.stringify(msg)); };
  const target = {did: meta.did, model: meta.model, host: meta.host, user: meta.user, region: meta.region};
  // Like the official app: open the speaker channel and wait for the camera's answer before any audio.
  let opening;
  try { opening = await openSpeaker(target); }
  catch (error) { tell({type: 'error', error: error.message}); ws.close(); return; }
  if (ws.readyState !== 1) return;

  const opus = opusModel(meta.model);
  const query = new URLSearchParams({...target, codec: opus ? 'opus' : 'pcma'});
  const bridge = http.request({host: '127.0.0.1', port: bridgePort, path: `/api/xiaomi/talkstream?${query}`, method: 'POST',
   headers: {'Content-Type': 'application/octet-stream', 'Transfer-Encoding': 'chunked'}});
  const encoder = spawnProcess(ffmpeg, talkEncoderArgs(opus), {windowsHide: true, stdio: ['pipe', 'pipe', 'pipe']});
  let finished = false;
  const finish = () => {
   if (finished) return;
   finished = true;
   clearTimeout(limit);
   try { encoder.stdin.end(); } catch {}
  };
  const limit = setTimeout(finish, maxSeconds * 1000);
  encoder.stderr.resume();
  encoder.stdin.on('error', () => {});
  const write = data => { if (!bridge.destroyed) bridge.write(data); };
  if (opus) {
   const read = createOggOpusReader(packet => {
    const size = Buffer.alloc(2);
    size.writeUInt16BE(packet.length);
    write(Buffer.concat([size, packet]));
   });
   encoder.stdout.on('data', chunk => { try { read(chunk); } catch { finish(); } });
  } else {
   encoder.stdout.on('data', write);
  }
  encoder.once('close', () => { if (!bridge.destroyed) bridge.end(); });
  encoder.once('error', () => { tell({type: 'error', error: 'Codificador de áudio indisponível.'}); finish(); });
  bridge.on('response', res => {
   let body = '';
   res.on('data', c => { body += c; });
   res.on('end', () => {
    let result = {};
    try { result = JSON.parse(body); } catch {}
    if (res.statusCode !== 200) tell({type: 'error', error: body.trim() || 'A câmera recusou o canal de fala.'});
    else tell({type: 'done', framesSent: result.framesSent, underruns: result.underruns});
    finish();
    try { ws.close(); } catch {}
   });
  });
  bridge.on('error', () => { tell({type: 'error', error: 'Ponte de câmeras indisponível.'}); finish(); });

  ws.on('message', (data, binary) => { if (binary && !finished) encoder.stdin.write(data); });
  ws.on('close', finish);
  tell({type: 'ready', codec: opus ? 'opus' : 'pcma', speakerAnswer: opening?.speakerAnswer ?? ''});
 }

 return {upgrade, close: () => { for (const client of wss.clients) client.close(); wss.close(); }};
}
