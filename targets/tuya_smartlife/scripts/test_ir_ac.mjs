import fs from 'node:fs';
import path from 'node:path';
import { createHash, createHmac, createCipheriv, createDecipheriv, randomUUID, randomInt } from 'node:crypto';

const CLIENT_ID = 'HA_3y9q4ak7g4ephrvke';
const token = JSON.parse(fs.readFileSync('targets/tuya_smartlife/runtime/tuya_token.json', 'utf-8'));

const NONCE_ALPHABET = 'ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678';
const SIGNED_HEADER_ORDER = ['X-appKey', 'X-requestId', 'X-sid', 'X-time', 'X-token'];

function md5HashKey(requestId, refreshToken) {
  return createHash('md5').update(requestId + refreshToken, 'utf8').digest('hex');
}

function generateSecret(requestId, sessionId, hashKey) {
  let message = hashKey;
  if (sessionId !== '') {
    const length = Math.min(sessionId.length, 16);
    let ecode = '';
    for (let i = 0; i < length; i++) {
      ecode += sessionId[sessionId.charCodeAt(i) % 16];
    }
    message += `_${ecode}`;
  }
  return createHmac('sha256', Buffer.from(requestId, 'utf8'))
    .update(message, 'utf8')
    .digest('hex')
    .slice(0, 16);
}

function randomNonce() {
  let nonce = '';
  for (let i = 0; i < 12; i++) {
    nonce += NONCE_ALPHABET[randomInt(0, NONCE_ALPHABET.length)];
  }
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
    if (val !== '') {
      headerSignString += `${header}=${val}||`;
    }
  }
  let signString = headerSignString.slice(0, -2);
  if (queryEncdata !== '') signString += queryEncdata;
  if (bodyEncdata !== '') signString += bodyEncdata;
  return createHmac('sha256', Buffer.from(hashKey, 'utf8')).update(signString, 'utf8').digest('hex');
}

async function request(method, reqPath, params, body) {
  const requestId = randomUUID();
  const sessionId = '';
  const hashKey = md5HashKey(requestId, token.refreshToken);
  const secret = generateSecret(requestId, sessionId, hashKey);

  const queryEncdata = params && Object.keys(params).length > 0 ? encryptAesGcm(JSON.stringify(params), secret) : '';
  const bodyEncdata = body && Object.keys(body).length > 0 ? encryptAesGcm(JSON.stringify(body), secret) : '';

  const headers = {
    'X-appKey': CLIENT_ID,
    'X-requestId': requestId,
    'X-sid': sessionId,
    'X-time': String(Date.now()),
    'X-token': token.accessToken,
  };

  const signedHeaders = {
    ...headers,
    'X-sign': restfulSign(hashKey, queryEncdata, bodyEncdata, headers),
    'Content-Type': 'application/json',
  };

  const url = new URL(token.endpoint + reqPath);
  if (queryEncdata !== '') url.searchParams.set('encdata', queryEncdata);

  const res = await fetch(url.toString(), {
    method,
    headers: signedHeaders,
    body: bodyEncdata === '' ? undefined : JSON.stringify({ encdata: bodyEncdata }),
  });

  const data = await res.json();
  if (typeof data.result === 'string') {
    try { data.result = JSON.parse(decryptAesGcm(data.result, secret)); } catch (e) {}
  }
  return data;
}

// Consulta especificações de Ar Mizin (ID: ebbe3e7e35f15b989avdos)
const specs = await request('GET', '/v1.1/m/life/ebbe3e7e35f15b989avdos/specifications');
console.log('Especificações Ar Mizin:', JSON.stringify(specs, null, 2));
