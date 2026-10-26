/**
 * Tuya Smart Life QR Login Service
 * Autentica com o app Smart Life usando o protocolo oficial Tuya/Home Assistant
 * Baixa todos os dispositivos da casa (Wi-Fi, Zigbee, etc.) e salva o token de sessão.
 */

import http from 'node:http';
import { createHash, createHmac, createCipheriv, createDecipheriv, randomUUID, randomInt } from 'node:crypto';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const CLIENT_ID = 'HA_3y9q4ak7g4ephrvke';
const SCHEMA = 'haauthorize';
const DEFAULT_ENDPOINT = 'https://apigw.iotbing.com';
const USER_CODE = 'Ba8HQfj';
const PORT = 19850;

const RUNTIME_DIR = path.resolve('targets/tuya_smartlife/runtime');
if (!fs.existsSync(RUNTIME_DIR)) {
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });
}

// -------------------------------------------------------------
// Funções Criptográficas Oficiais do Protocolo Tuya Device Sharing
// -------------------------------------------------------------
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

// -------------------------------------------------------------
// Cliente de API Tuya Device Sharing
// -------------------------------------------------------------
class TuyaClient {
  constructor(token) {
    this.token = token;
    this.endpoint = token.endpoint;
  }

  async request(method, path, params, body) {
    const requestId = randomUUID();
    const sessionId = '';
    const hashKey = md5HashKey(requestId, this.token.refreshToken);
    const secret = generateSecret(requestId, sessionId, hashKey);

    const queryEncdata = params && Object.keys(params).length > 0 ? encryptAesGcm(JSON.stringify(params), secret) : '';
    const bodyEncdata = body && Object.keys(body).length > 0 ? encryptAesGcm(JSON.stringify(body), secret) : '';

    const headers = {
      'X-appKey': CLIENT_ID,
      'X-requestId': requestId,
      'X-sid': sessionId,
      'X-time': String(Date.now()),
      'X-token': this.token.accessToken,
    };

    const signedHeaders = {
      ...headers,
      'X-sign': restfulSign(hashKey, queryEncdata, bodyEncdata, headers),
      'Content-Type': 'application/json',
    };

    const url = new URL(this.endpoint + path);
    if (queryEncdata !== '') {
      url.searchParams.set('encdata', queryEncdata);
    }

    const res = await fetch(url.toString(), {
      method,
      headers: signedHeaders,
      body: bodyEncdata === '' ? undefined : JSON.stringify({ encdata: bodyEncdata }),
    });

    const data = await res.json();
    if (!data.success) {
      throw new Error(`Tuya API error: ${data.code} - ${data.msg}`);
    }

    if (typeof data.result === 'string') {
      try {
        data.result = JSON.parse(decryptAesGcm(data.result, secret));
      } catch (e) {
        // payload já parseado ou raw
      }
    }
    return data;
  }

  async discoverAll() {
    console.log('[*] Consultando casas cadastradas no Smart Life...');
    const homesRes = await this.request('GET', '/v1.0/m/life/users/homes');
    const homes = Array.isArray(homesRes.result) ? homesRes.result : [];
    console.log(`[+] Encontrada(s) ${homes.length} casa(s).`);

    let allDevices = [];
    for (const home of homes) {
      const homeId = home.homeId || home.ownerId;
      const homeName = home.name || `Casa ${homeId}`;
      console.log(`[*] Buscando dispositivos da casa: "${homeName}" (ID: ${homeId})...`);
      
      const devRes = await this.request('GET', '/v1.0/m/life/ha/home/devices', { homeId: String(homeId) });
      const devs = Array.isArray(devRes.result) ? devRes.result : [];
      console.log(`[+] ${devs.length} dispositivos encontrados nesta casa.`);
      
      for (const d of devs) {
        d.homeName = homeName;
        d.homeId = homeId;
        allDevices.push(d);
      }
    }
    return { homes, devices: allDevices };
  }
}

// -------------------------------------------------------------
// Fluxo de QR Code e Polling
// -------------------------------------------------------------
let currentQr = null;
let sessionState = 'initializing';
let authorizedData = null;

async function createQrToken() {
  const url = `${DEFAULT_ENDPOINT}/v1.0/m/life/home-assistant/qrcode/tokens?clientid=${CLIENT_ID}&usercode=${USER_CODE}&schema=${SCHEMA}`;
  const res = await fetch(url, { method: 'POST', headers: { 'User-Agent': 'HomeAssistant/2024.1' } });
  const data = await res.json();
  if (data.success && data.result?.qrcode) {
    const token = data.result.qrcode;
    const qrUrl = `tuyaSmart--qrLogin?token=${token}`;
    currentQr = { token, qrUrl, createdAt: Date.now() };
    sessionState = 'waiting_scan';
    console.log('[+] QR Code gerado com sucesso!');
    console.log(`[+] Token: ${token}`);
    return currentQr;
  } else {
    throw new Error(`Falha ao gerar QR Code: ${data.msg || data.code}`);
  }
}

async function pollQr() {
  if (!currentQr) return;
  const url = `${DEFAULT_ENDPOINT}/v1.0/m/life/home-assistant/qrcode/tokens/${currentQr.token}?clientid=${CLIENT_ID}&usercode=${USER_CODE}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    if (data.success && data.result?.access_token) {
      sessionState = 'authorized';
      console.log('\n' + '='.repeat(60));
      console.log('🎉 SUCESSO! LOGIN AUTORIZADO NO SMART LIFE!');
      console.log('='.repeat(60));

      const tokenObj = {
        uid: data.result.uid,
        accessToken: data.result.access_token,
        refreshToken: data.result.refresh_token,
        endpoint: data.result.endpoint,
        terminalId: data.result.terminal_id,
        userCode: USER_CODE,
        savedAt: new Date().toISOString()
      };

      fs.writeFileSync(path.join(RUNTIME_DIR, 'tuya_token.json'), JSON.stringify(tokenObj, null, 2));
      console.log('[+] Token salvo em targets/tuya_smartlife/runtime/tuya_token.json');

      // Busca todos os dispositivos da casa
      const client = new TuyaClient(tokenObj);
      const inventory = await client.discoverAll();
      fs.writeFileSync(path.join(RUNTIME_DIR, 'tuya_cloud_devices.json'), JSON.stringify(inventory, null, 2));
      console.log(`[+] Catálogo completo com ${inventory.devices.length} dispositivos salvo em targets/tuya_smartlife/runtime/tuya_cloud_devices.json`);
      
      authorizedData = inventory;
      sessionState = 'completed';
    }
  } catch (err) {
    // silencia poll failures normais
  }
}

// Inicia polling a cada 2.5s
setInterval(() => {
  if (sessionState === 'waiting_scan') {
    pollQr();
  }
}, 2500);

// -------------------------------------------------------------
// Servidor Web Local para Exibir o QR Code
// -------------------------------------------------------------
const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      state: sessionState,
      qrUrl: currentQr?.qrUrl,
      deviceCount: authorizedData?.devices?.length ?? 0
    }));
    return;
  }

  // Página principal
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  const qrImgUrl = currentQr ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(currentQr.qrUrl)}` : '';
  
  res.end(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Mizin Home — Autorização Tuya / Smart Life</title>
  <style>
    :root {
      --bg: #090d16;
      --card: #121927;
      --border: #1e293b;
      --text: #f8fafc;
      --muted: #94a3b8;
      --accent: #38bdf8;
      --success: #10b981;
    }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
    }
    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 32px;
      max-width: 440px;
      width: 100%;
      text-align: center;
      box-shadow: 0 20px 40px rgba(0,0,0,0.5);
    }
    h1 {
      font-size: 20px;
      margin-top: 0;
      color: var(--accent);
      letter-spacing: -0.5px;
    }
    p {
      color: var(--muted);
      font-size: 14px;
      line-height: 1.5;
    }
    .qr-container {
      background: #ffffff;
      padding: 16px;
      border-radius: 12px;
      display: inline-block;
      margin: 20px 0;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .qr-container img {
      display: block;
      width: 280px;
      height: 280px;
    }
    .steps {
      text-align: left;
      background: rgba(255,255,255,0.03);
      padding: 16px;
      border-radius: 8px;
      font-size: 13px;
      margin-top: 16px;
      border: 1px solid rgba(255,255,255,0.06);
    }
    .steps ol {
      margin: 0;
      padding-left: 20px;
    }
    .steps li {
      margin-bottom: 6px;
      color: #cbd5e1;
    }
    .status {
      margin-top: 16px;
      padding: 8px 16px;
      border-radius: 20px;
      display: inline-block;
      font-size: 12px;
      font-weight: 600;
      background: rgba(56, 189, 248, 0.1);
      color: var(--accent);
    }
    .success-box {
      display: none;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: var(--success);
      padding: 16px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      margin-top: 20px;
    }
  </style>
</head>
<body>
  <div class="card">
    <h1>Mizin Home — Autorização Smart Life</h1>
    <p>Escaneie o QR Code abaixo com o aplicativo <strong>Smart Life</strong> no seu celular para autorizar o controle local.</p>

    <div class="qr-container" id="qrWrapper">
      <img src="${qrImgUrl}" alt="QR Code Tuya">
    </div>

    <div id="statusBadge" class="status">Aguardando leitura no celular...</div>

    <div id="successBox" class="success-box">
      🎉 Autorizado com sucesso!<br>
      <span id="devCount"></span> dispositivos sincronizados.
    </div>

    <div class="steps">
      <ol>
        <li>Abra o app <strong>Smart Life</strong> no celular.</li>
        <li>Toque na aba <strong>Eu</strong> (canto inferior direito).</li>
        <li>Toque no ícone de <strong>Scanner [ - ]</strong> no topo à direita.</li>
        <li>Aponte a câmera para este QR Code e toque em <strong>Autorizar</strong>.</li>
      </ol>
    </div>
  </div>

  <script>
    async function checkStatus() {
      try {
        const res = await fetch('/status');
        const data = await res.json();
        if (data.state === 'completed') {
          document.getElementById('statusBadge').style.display = 'none';
          document.getElementById('qrWrapper').style.opacity = '0.3';
          const sBox = document.getElementById('successBox');
          sBox.style.display = 'block';
          document.getElementById('devCount').innerText = data.deviceCount;
        } else {
          setTimeout(checkStatus, 1500);
        }
      } catch (e) {
        setTimeout(checkStatus, 2000);
      }
    }
    checkStatus();
  </script>
</body>
</html>`);
});

// Inicialização
createQrToken().then(() => {
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`[+] Servidor local de autorização rodando em: http://127.0.0.1:${PORT}`);
    // Abre navegador automaticamente
    spawn('cmd', ['/c', 'start', `http://127.0.0.1:${PORT}`]);
  });
}).catch(err => {
  console.error('[-] Erro ao iniciar:', err);
});
