import fs from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const certsDir = path.resolve(__dirname, '../binaries/certs');

const cert = fs.readFileSync(path.join(certsDir, 'gwm_general.cer'), 'utf8');
const key = fs.readFileSync(path.join(certsDir, 'gwm_general.key'), 'utf8');
const ca = fs.readFileSync(path.join(certsDir, 'gwm_root.cer'), 'utf8');

function requestJson(urlString, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlString);
    const reqOptions = {
      hostname: url.hostname,
      port: url.port || 443,
      path: url.pathname + url.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      ...options.tls,
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        let parsed = data;
        try {
          parsed = JSON.parse(data);
        } catch {}
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: parsed,
        });
      });
    });

    req.on('error', (err) => reject(err));
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function main() {
  const results = {
    timestamp: new Date().toISOString(),
    probes: {},
  };

  // Probe 1: Auth Gateway (br-front-service.gwmcloud.com)
  try {
    const authUrl =
      'https://br-front-service.gwmcloud.com/br-official-commerce/br-official-gateway/pc-api/api/v1.0/userAuth/loginAccount';
    const body = JSON.stringify({
      deviceid: '00000000000000000000000000000000',
      password: '00000000000000000000000000000000',
      account: 'probe@example.com',
    });
    results.probes.authGateway = await requestJson(
      authUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
          appid: '6',
          brand: '6',
          brandid: 'CCZ001',
          country: 'BR',
          devicetype: '0',
          enterpriseid: 'CC01',
          gwid: '',
          language: 'pt_BR',
          rs: '5',
          terminal: 'GW_PC_GWM',
        },
      },
      body
    );
  } catch (err) {
    results.probes.authGateway = { error: err.message, code: err.code };
  }

  // Probe 2: Vehicle App Gateway with mTLS (br-app-gateway.gwmcloud.com)
  try {
    const vehicleUrl =
      'https://br-app-gateway.gwmcloud.com/app-api/api/v1.0/globalapp/vehicle/acquireVehicles';
    results.probes.vehicleGatewayMtls = await requestJson(vehicleUrl, {
      method: 'GET',
      headers: {
        rs: '2',
        terminal: 'GW_APP_GWM',
        brand: '6',
        language: 'pt_BR',
        systemtype: '2',
        regioncode: 'BR',
        country: 'BR',
        accessToken: 'invalid_probe_token',
      },
      tls: {
        cert,
        key,
        ca,
        rejectUnauthorized: false,
        ciphers: 'DEFAULT:@SECLEVEL=0',
      },
    });
  } catch (err) {
    results.probes.vehicleGatewayMtls = { error: err.message, code: err.code };
  }

  const outPath = path.resolve(__dirname, '../evidence/br_gateway_probe.json');
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2), 'utf8');
  console.log(JSON.stringify(results, null, 2));
}

main();

