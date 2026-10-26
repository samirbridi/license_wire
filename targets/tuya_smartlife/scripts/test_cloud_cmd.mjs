import fs from 'node:fs';
import { createHash, createHmac, createCipheriv, createDecipheriv, randomUUID, randomInt } from 'node:crypto';

const CLIENT_ID = 'HA_3y9q4ak7g4ephrvke';
const TOKEN_PATH = 'targets/tuya_smartlife/runtime/tuya_token.json';
const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf-8'));

const NONCE_ALPHABET = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678';
const SIGNED_HEADER_ORDER = ['X-appKey', 'X-requestId', 'X-sid', 'X-time', 'X-token'];

function md5HashKey(requestId, refreshToken) {
  return createHash('md5').update(requestId + refreshToken, 'utf8').digest('hex');
}
function generateSecret(requestId, sessionId, hashKey) {
  let message = hashKey;
  return createHmac('sha256', Buffer.from(requestId, 'utf8')).update(message, 'utf8').digest('hex').slice(0, 16);
}
function randomNonce() {
  let nonce = '';
  for (let i = 0; i < 12; i++) nonce += NONCE_ALPHABET[randomInt(0, NONCE_ALPHABET.length)];
  return nonce;
}
function encryptAesGcm(rawData, secret, nonce = randomNonce()) {
  const cipher = createCipheriv('aes-128-gcm', Buffer.from(secret, 'utf8'), Buffer.from(nonce, 'utf8'));
  const encrypted = Buffer.concat([cipher.update(rawData, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  return Buffer.from(nonce, 'utf8').toString('base64') + encrypted.toString('base64');
}
function decryptAesGcm(cipherData, secret) {
  const decoded = Buffer.from(cipherData, 'base64');
  const nonce = decoded.subarray(0, 12);
  const cipherTextWithTag = decoded.subarray(12);
  const authTag = cipherTextWithTag.subarray(cipherTextWithTag.length - 16);
  const cipherText = cipherTextWithTag.subarray(0, cipherTextWithTag.length - 16);
  const decipher = createDecipheriv('aes-128-gcm', Buffer.from(secret, 'utf8'), nonce);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(cipherText), decipher.final()]).toString('utf8');
}
function restfulSign(hashKey, queryEncdata, bodyEncdata, headers) {
  let headerSignString = '';
  for (const header of SIGNED_HEADER_ORDER) {
    const val = headers[header] ?? '';
    if (val !== '') headerSignString += `${header}=${val}||`;
  }
  let signString = headerSignString.slice(0, -2);
  if (queryEncdata !== '') signString += queryEncdata;
  if (bodyEncdata !== '') signString += bodyEncdata;
  return createHmac('sha256', Buffer.from(hashKey, 'utf8')).update(signString, 'utf8').digest('hex');
}

async function test(devId, commands) {
  const requestId = randomUUID();
  const sessionId = '';
  const hashKey = md5HashKey(requestId, token.refreshToken);
  const secret = generateSecret(requestId, sessionId, hashKey);
  const body = { commands };
  const bodyEncdata = encryptAesGcm(JSON.stringify(body), secret);

  const headers = {
    'X-appKey': CLIENT_ID,
    'X-requestId': requestId,
    'X-sid': sessionId,
    'X-time': String(Date.now()),
    'X-token': token.accessToken,
  };
  const signedHeaders = {
    ...headers,
    'X-sign': restfulSign(hashKey, '', bodyEncdata, headers),
    'Content-Type': 'application/json',
  };

  const url = `${token.endpoint}/v1.1/m/thing/${devId}/commands`;
  const res = await fetch(url, { method: 'POST', headers: signedHeaders, body: JSON.stringify({ encdata: bodyEncdata }) });
  console.log('HTTP Status:', res.status);
  const json = await res.json();
  if (json.result) {
    try {
      const dec = decryptAesGcm(json.result, secret);
      console.log('Decrypted result:', dec);
    } catch (e) {
      console.log('Raw result:', json);
    }
  } else {
    console.log('Response:', json);
  }
}

// Também vamos checar as especificações/funções suportadas pelo Ar Mizin
async function checkDeviceSpecs(devId) {
  const requestId = randomUUID();
  const sessionId = '';
  const hashKey = md5HashKey(requestId, token.refreshToken);
  const secret = generateSecret(requestId, sessionId, hashKey);

  const headers = {
    'X-appKey': CLIENT_ID,
    'X-requestId': requestId,
    'X-sid': sessionId,
    'X-time': String(Date.now()),
    'X-token': token.accessToken,
  };
  const signedHeaders = {
    ...headers,
    'X-sign': restfulSign(hashKey, '', '', headers),
  };

  const url = `${token.endpoint}/v1.0/m/things/${devId}/model`;
  const res = await fetch(url, { headers: signedHeaders });
  console.log('Model status:', res.status);
  const json = await res.json();
  if (json.result) {
    try {
      console.log('Model Decrypted:', decryptAesGcm(json.result, secret));
    } catch(e) {
      console.log('Model raw:', json);
    }
  } else {
    console.log('Model response:', json);
  }
}

await test('ebbe3e7e35f15b989avdos', [{ code: 'PowerOn', value: 'PowerOn' }]);
