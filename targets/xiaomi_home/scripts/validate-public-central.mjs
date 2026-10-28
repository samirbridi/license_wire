import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join,resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const target=resolve(dirname(fileURLToPath(import.meta.url)),'..'),runtime=join(target,'runtime/central');
const local='http://127.0.0.1:19845',publicOrigin='https://homecams.pages.dev';
const out=join(target,'evidence/private','public-qa-'+Date.now());mkdirSync(out,{recursive:true});
const results={observedAt:new Date().toISOString(),origin:publicOrigin};
const code=new URLSearchParams(new URL(JSON.parse(readFileSync(join(runtime,'local-access.json'),'utf8')).url).hash.slice(1)).get('pair');
const login=await fetch(local+'/api/session',{method:'POST',headers:{Origin:local,'Content-Type':'application/json'},body:JSON.stringify({code})});
if(!login.ok)throw new Error('Fresh local invitation required.');
const headers={Cookie:login.headers.get('set-cookie').split(';')[0],Origin:local};
const session=await(await fetch(local+'/api/session',{headers})).json();let remoteHeaders,remoteCSRF;
try{
 results.unauthenticated={};for(const path of ['/api/cameras','/api/recordings/outdoor_pro_poste','/api/video/outdoor_pro_poste']){const r=await fetch(publicOrigin+path);await r.body?.cancel();results.unauthenticated[path]=r.status;}
 const invite=await(await fetch(local+'/api/remote-link',{method:'POST',headers:{...headers,'X-CSRF-Token':session.csrf}})).json();
 if(!invite.url)throw new Error('Remote invitation unavailable');
 const remoteCode=new URLSearchParams(new URL(invite.url).hash.slice(1)).get('pair');
 const pairing=await fetch(publicOrigin+'/api/session',{method:'POST',headers:{Origin:publicOrigin,'Content-Type':'application/json'},body:JSON.stringify({code:remoteCode})});
 results.pairingStatus=pairing.status;
 if(!pairing.ok)throw new Error('Public pairing failed: '+pairing.status);
 const cookie=pairing.headers.get('set-cookie');results.secureCookie=cookie.includes('Secure')&&cookie.includes('HttpOnly');
 remoteHeaders={Cookie:cookie.split(';')[0],Origin:publicOrigin};
 const s=await(await fetch(publicOrigin+'/api/session',{headers:remoteHeaders})).json();remoteCSRF=s.csrf;
 const cameras=await(await fetch(publicOrigin+'/api/cameras',{headers:remoteHeaders})).json();results.cameraCount=cameras.length;
 const storage=await fetch(publicOrigin+'/api/recordings/outdoor_pro_poste?view=view2&date=2026-10-27',{headers:remoteHeaders,signal:AbortSignal.timeout(45000)});
 const catalog=await storage.json();results.storage={status:storage.status,periodCount:catalog.periods?.length??null};
 const clip=await fetch(publicOrigin+'/api/clip/outdoor_pro_poste?view=view2&at=1793102557&end=1793102562&quality=original',{headers:remoteHeaders,signal:AbortSignal.timeout(65000)});
 results.clip={status:clip.status,contentType:clip.headers.get('content-type'),cacheControl:clip.headers.get('cache-control')};
 const data=Buffer.from(await clip.arrayBuffer());results.clip.bytes=data.length;if(clip.ok)writeFileSync(join(out,'remote-sd.mp4'),data);
 results.version=await(await fetch(publicOrigin+'/api/version')).json();
 const owner=await(await fetch(local+'/api/remote-link',{method:'POST',headers:{...headers,'X-CSRF-Token':session.csrf}})).json();writeFileSync(join(runtime,'owner-remote-access.json'),JSON.stringify(owner,null,2));
 results.pass=Object.values(results.unauthenticated).every(x=>x===401)&&results.cameraCount===6&&results.storage.periodCount>0&&results.secureCookie&&results.clip.status===200&&results.clip.bytes>10000;
}finally{
 if(remoteHeaders&&remoteCSRF)await fetch(publicOrigin+'/api/logout',{method:'POST',headers:{...remoteHeaders,'X-CSRF-Token':remoteCSRF}});
 await fetch(local+'/api/local-link',{method:'POST',headers:{...headers,'X-CSRF-Token':session.csrf}});
 await fetch(local+'/api/logout',{method:'POST',headers:{...headers,'X-CSRF-Token':session.csrf}});
 writeFileSync(join(out,'receipt.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({...results,privateFolder:out}));
}
