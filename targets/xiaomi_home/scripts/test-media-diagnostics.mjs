import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCentralAV } from './media-diagnostics.mjs';
test('AV diagnostics distinguish codec FourCC from actual frame dimensions', () => {
  const text = 'Video: h264 (High) (avc1 / 0x31637661), yuv420p, 2304x1296, 15 fps\nAudio: aac (LC), 48000 Hz, mono\nvideo:300KiB audio:285KiB';
  const result = parseCentralAV(text, 0);
  assert.equal(result.width, 2304); assert.equal(result.height, 1296); assert.equal(result.pass, true);
});
test('AV proof requires dimensions, decoded audio data and successful decode', () => {
  const text = 'Video: h264 (avc1 / 0x31637661)\nAudio: aac (LC), 48000 Hz, mono\naudio:0KiB';
  assert.equal(parseCentralAV(text, 0).pass, false);
  assert.equal(parseCentralAV('Video: h264, 2304x1296\nAudio: aac, 48000 Hz\naudio:285KiB', 1).pass, false);
});
