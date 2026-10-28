import {isIP} from 'node:net';
export function cameraMetadata(entries){
 const result=new Map();
 if(!Array.isArray(entries))throw new Error('Inventário de câmeras inválido.');
 for(const item of entries){
  if(!/^[a-z0-9_]{1,80}$/.test(item.alias??''))throw new Error('Alias de câmera inválido.');
  const u=new URL(item.source),did=u.searchParams.get('did'),model=u.searchParams.get('model');
  if(u.protocol!=='xiaomi:'||!isIP(u.hostname)||!/^\d+$/.test(did??'')||!model)throw new Error('Fonte de câmera inválida.');
  result.set(item.alias,{alias:item.alias,rawUrl:item.source,user:decodeURIComponent(u.username),region:decodeURIComponent(u.password),host:u.hostname,did,model,channel:Number(u.searchParams.get('channel')??0),subtype:u.searchParams.get('subtype')??''});
 }
 return result;
}
