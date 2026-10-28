import {readdir,readFile,lstat,realpath,mkdir,unlink,rmdir,appendFile,statfs,link} from 'node:fs/promises';
import {join,resolve,sep,dirname,basename} from 'node:path';
const validId=id=>/^[a-f0-9]{32}$/.test(id);
export function createArchiveIndex({root,aliases,now=()=>Date.now()}){
 const base=resolve(root),known=new Set(aliases);let cached=null,cachedAt=0,quotaCache=null,quotaAt=0,cleaning=null;
 const cameraName=alias=>alias.replace(/_quality\d+$/,'').replace(/_channel2$/,'');
 function folder(alias,startedAt){if(!known.has(alias))throw new Error('Câmera desconhecida.');const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(startedAt)),get=t=>parts.find(p=>p.type===t)?.value;return join(base,cameraName(alias),get('year'),get('month'),get('day'));}
 async function walk(directory=base,depth=0){let entries;try{entries=await readdir(directory,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return[];throw e;}const result=[];for(const entry of entries){if(entry.isSymbolicLink())continue;const path=join(directory,entry.name);if(entry.isDirectory()&&depth<5&&/^[a-z0-9_-]+$/i.test(entry.name))result.push(...await walk(path,depth+1));else if(entry.isFile())result.push(path);}return result;}
 async function contained(path){const actual=await realpath(path),home=await realpath(base);if(!actual.startsWith(home+sep))throw new Error('Arquivo fora do armazenamento.');const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink())throw new Error('Arquivo inválido.');return actual;}
 async function entries(force=false){if(!force&&cached&&now()-cachedAt<15000)return cached;const records=[];for(const path of await walk()){if(!/^[a-f0-9]{32}\.json$/.test(basename(path)))continue;try{await contained(path);const record=JSON.parse(await readFile(path,'utf8'));if(!validId(record.id)||basename(path)!==record.id+'.json'||!known.has(record.alias)||!Number.isFinite(Date.parse(record.startedAt)))continue;const file=join(dirname(path),record.id+'.mkv');await contained(file);records.push({record,file,metadata:path});}catch(e){if(!['ENOENT','SyntaxError'].includes(e.code||e.name))throw e;}}cached=records.sort((a,b)=>a.record.startedAt.localeCompare(b.record.startedAt));cachedAt=now();return cached;}
 async function find(id){if(!validId(id))throw new Error('Gravação inválida.');let item=(await entries()).find(x=>x.record.id===id);if(!item)item=(await entries(true)).find(x=>x.record.id===id);if(!item)throw new Error('Gravação não encontrada.');await contained(item.file);return item;}
 async function usage({force=false,statFile=lstat}={}){if(!force&&quotaCache!==null&&now()-quotaAt<15000)return quotaCache;let total=0;for(const file of await walk())if(file.endsWith('.mkv')){try{const s=await statFile(file);if(s.isFile?.()===false||s.isSymbolicLink?.())continue;total+=s.size;}catch(e){if(e.code!=='ENOENT')throw e;}}quotaCache=total;quotaAt=now();return total;}
 async function prune({maxBytes,highWater=.92,lowWater=.85,reserveBytes=50*1024**3,minAgeMs=15*60000,dryRun=false}={}){
  if(cleaning)return cleaning;
  cleaning=(async()=>{if(!Number.isFinite(maxBytes)||maxBytes<=0||!(lowWater>0&&lowWater<highWater&&highWater<=1)||reserveBytes<0)throw new Error('Política de retenção inválida.');await mkdir(base,{recursive:true,mode:0o700});const disk=await statfs(base);let free=Number(disk.bavail)*Number(disk.bsize),used=await usage({force:true});const planned=[];if(used<maxBytes*highWater&&free>=reserveBytes)return{usedBytes:used,freeBytes:free,deleted:planned,dryRun};
   for(const item of await entries(true)){
    if(used<=maxBytes*lowWater&&free>=reserveBytes*1.1)break;
    if(now()-Date.parse(item.record.startedAt)<minAgeMs)continue;
    const path=await contained(item.file),info=await lstat(path);const event={at:new Date(now()).toISOString(),id:item.record.id,alias:item.record.alias,bytes:info.size,startedAt:item.record.startedAt};
    if(!dryRun){await appendFile(join(base,'retention-events.ndjson'),JSON.stringify({...event,phase:'planned'})+'\n',{mode:0o600});await unlink(path);try{await unlink(item.metadata);}catch(e){if(e.code!=='ENOENT')throw e;}await appendFile(join(base,'retention-events.ndjson'),JSON.stringify({...event,phase:'deleted'})+'\n',{mode:0o600});
     let dir=dirname(path);while(dir!==base&&dir.startsWith(base+sep)){try{await rmdir(dir);}catch(e){if(['ENOTEMPTY','EEXIST'].includes(e.code))break;if(e.code!=='ENOENT')throw e;}dir=dirname(dir);}
    }
    planned.push(event);used-=info.size;free+=info.size;
   }
   cached=null;quotaCache=null;return{usedBytes:used,freeBytes:free,deleted:planned,dryRun};
  })().finally(()=>{cleaning=null;});return cleaning;
 }
 async function organizeLegacy({dryRun=false}={}){const moved=[];for(const item of await entries(true)){const destination=folder(item.record.alias,item.record.startedAt);if(dirname(item.file)===destination)continue;await contained(item.file);if(!dryRun){await mkdir(destination,{recursive:true,mode:0o700});const file=join(destination,item.record.id+'.mkv'),metadata=join(destination,item.record.id+'.json');await link(item.file,file);try{await link(item.metadata,metadata);}catch(e){await unlink(file);throw e;}await unlink(item.metadata);await unlink(item.file);}moved.push({id:item.record.id,alias:item.record.alias});}cached=null;quotaCache=null;return{moved,dryRun};}
 return{folder,entries,find,usage,prune,organizeLegacy,invalidate(){cached=null;quotaCache=null;}};
}
