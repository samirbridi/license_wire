import https from 'node:https';

function probe(path, method = 'POST', body = {}) {
  return new Promise((resolve) => {
    const url =
      'https://br-front-service.gwmcloud.com/br-official-commerce/br-official-gateway/pc-api/api/v1.0' +
      path;
    const req = https.request(
      url,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          appid: '6',
          brand: '6',
          brandid: 'CCZ001',
          country: 'BR',
          language: 'pt_BR',
          terminal: 'GW_PC_GWM',
          rs: '5',
        },
      },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ path, status: res.statusCode, data }));
      }
    );
    req.on('error', (e) => resolve({ path, error: e.message }));
    if (method === 'POST') req.write(JSON.stringify(body));
    req.end();
  });
}

async function run() {
  const endpoints = [
    '/userAuth/loginAccount',
    '/userAuth/getSMSCode',
    '/userAuth/loginWithSMS',
    '/userAuth/getVerifyCode',
    '/userAuth/loginWithVerifyCode',
    '/userAuth/thirdPartyLogin',
    '/userAuth/loginWithThirdParty',
    '/userAuth/oauthLogin',
  ];
  for (const ep of endpoints) {
    const r = await probe(ep, 'POST', { test: 1 });
    console.log(ep, '->', r.status, r.data ? r.data.slice(0, 120) : r.error);
  }
}
run();

