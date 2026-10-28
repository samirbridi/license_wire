import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createIdentity} from '../portal-identity.mjs';
const runtime=join(process.env.MIZIN_CAMERAS_TARGET,'runtime/central');
const config=JSON.parse(await readFile(join(runtime,'https-gateway.json'),'utf8'));
const app=await createIdentity({directory:join(runtime,'identity'),origin:config.origin,gatewayToken:config.gatewayToken});await app.start();
console.log('Identidade pronta; configuração inicial na pasta privada identity/owner-setup.json.');
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,async()=>{await app.close();process.exit(0);});
