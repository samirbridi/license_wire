import {readdir,readFile,lstat,realpath,mkdir,unlink,rmdir,appendFile,statfs,link,writeFile} from 'node:fs/promises';
import {join,resolve,sep,dirname,basename} from 'node:path';
const validId=id=>/^[a-f0-9]{32}$/.test(id);
const META='.meta';
// Layout: <camera>/<AAAA-MM-DD>/<HH-MM-SS>[_visao1|_visao2].mkv, metadata in <camera>/<AAAA-MM-DD>/.meta/<same name>.json.
export const cameraName=alias=>alias.replace(/_quality\d+$/,'').replace(/_channel2$/,'');
function localParts(at){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(new Date(at)),get=t=>parts.find(p=>p.type===t)?.value;return{day:`${get('year')}-${get('month')}-${get('day')}`,time:`${get('hour')}-${get('minute')}-${get('second')}`};}
export const localDay=at=>localParts(at).day;
async function diskSpace(directory){const s=await statfs(directory);return{total:Number(s.blocks)*Number(s.bsize),free:Number(s.bavail)*Number(s.bsize)};}
export function createArchiveIndex({root,aliases,now=()=>Date.now(),disk=diskSpace}){
 const base=resolve(root),known=new Set(aliases),dual=new Set(aliases.filter(a=>/_channel2(?:_quality\d+)?$/.test(a)).map(cameraName));
 // Cameras with two views (Outdoor Pro) always label both files, so each moment sorts as a visao1/visao2 pair.
 const viewSuffix=alias=>/_channel2(?:_quality\d+)?$/.test(alias)?'_visao2':dual.has(cameraName(alias))?'_visao1':'';let cached=null,cachedAt=0,quotaCache=null,quotaAt=0,cleaning=null;
 function folder(alias,startedAt){if(!known.has(alias))throw new Error('Câmera desconhecida.');return join(base,cameraName(alias),localDay(startedAt));}
 function stem(alias,startedAt){return localParts(startedAt).time+viewSuffix(alias);}
 async function exists(path){try{await lstat(path);return true;}catch(e){if(e.code==='ENOENT')return false;throw e;}}
 // Never overwrite: a second segment starting in the same second receives _2, _3…
 async function reserveName(alias,startedAt){const dir=folder(alias,startedAt),first=stem(alias,startedAt);for(let n=1;n<1000;n++){const name=n===1?first:`${first}_${n}`;if(!await exists(join(dir,name+'.mkv'))&&!await exists(join(dir,META,name+'.json')))return{dir,name};}throw new Error('Nomes de gravação esgotados.');}
 async function walk(directory=base,depth=0){let entries;try{entries=await readdir(directory,{withFileTypes:true});}catch(e){if(e.code==='ENOENT')return[];throw e;}const result=[];for(const entry of entries){if(entry.isSymbolicLink())continue;const path=join(directory,entry.name);if(entry.isDirectory()&&depth<5&&(entry.name===META||/^[a-z0-9_-]+$/i.test(entry.name)))result.push(...await walk(path,depth+1));else if(entry.isFile())result.push(path);}return result;}
 async function contained(path){const actual=await realpath(path),home=await realpath(base);if(!actual.startsWith(home+sep))throw new Error('Arquivo fora do armazenamento.');const s=await lstat(path);if(!s.isFile()||s.isSymbolicLink())throw new Error('Arquivo inválido.');return actual;}
 function videoFor(path,record){
  const name=basename(path);
  if(basename(dirname(path))===META){if(typeof record.file!=='string'||!/^[0-9a-z_-]{1,80}\.mkv$/i.test(record.file)||record.file!==name.replace(/\.json$/,'.mkv'))return null;return join(dirname(dirname(path)),record.file);}
  if(name!==record.id+'.json')return null;return join(dirname(path),record.id+'.mkv');
 }
 async function entries(force=false){if(!force&&cached&&now()-cachedAt<15000)return cached;const records=[];for(const path of await walk()){if(!path.endsWith('.json')||basename(path)==='status.json')continue;try{await contained(path);const record=JSON.parse(await readFile(path,'utf8'));if(!validId(record.id)||!known.has(record.alias)||!Number.isFinite(Date.parse(record.startedAt)))continue;const file=videoFor(path,record);if(!file)continue;await contained(file);records.push({record,file,metadata:path});}catch(e){if(!['ENOENT','SyntaxError'].includes(e.code||e.name))throw e;}}cached=records.sort((a,b)=>a.record.startedAt.localeCompare(b.record.startedAt));cachedAt=now();return cached;}
 async function find(id){if(!validId(id))throw new Error('Gravação inválida.');let item=(await entries()).find(x=>x.record.id===id);if(!item)item=(await entries(true)).find(x=>x.record.id===id);if(!item)throw new Error('Gravação não encontrada.');await contained(item.file);return item;}
 async function usage({force=false,statFile=lstat}={}){if(!force&&quotaCache!==null&&now()-quotaAt<15000)return quotaCache;let total=0;for(const file of await walk())if(file.endsWith('.mkv')){try{const s=await statFile(file);if(s.isFile?.()===false||s.isSymbolicLink?.())continue;total+=s.size;}catch(e){if(e.code!=='ENOENT')throw e;}}quotaCache=total;quotaAt=now();return total;}
 async function removeEmpty(dir){while(dir!==base&&dir.startsWith(base+sep)){try{await rmdir(dir);}catch(e){if(['ENOTEMPTY','EEXIST','EPERM','EBUSY'].includes(e.code))break;if(e.code!=='ENOENT')throw e;}dir=dirname(dir);}}
 async function remove(item){await unlink(item.file);try{await unlink(item.metadata);}catch(e){if(e.code!=='ENOENT')throw e;}await removeEmpty(dirname(item.metadata));await removeEmpty(dirname(item.file));}
 // Disk-driven rotation. Without a fixed quota the whole volume is used until highWater;
 // copies already confirmed in R2 are erased first, the oldest local-only ones only if still needed.
 async function prune({maxBytes=0,highWater=.9,lowWater=.85,reserveBytes=50*1024**3,minAgeMs=15*60000,dryRun=false,uploaded=new Set(),requireBackup=false}={}){
  if(cleaning)return cleaning;
  cleaning=(async()=>{if(!Number.isFinite(maxBytes)||maxBytes<0||!(lowWater>0&&lowWater<highWater&&highWater<=1)||!(reserveBytes>=0))throw new Error('Política de retenção inválida.');await mkdir(base,{recursive:true,mode:0o700});
   const space=await disk(base);let free=space.free,used=await usage({force:true});const total=space.total,planned=[];
   const over=()=>(total>0&&(total-free)/total>=highWater)||free<reserveBytes||(maxBytes>0&&used>=maxBytes*highWater);
   const settled=()=>(total<=0||(total-free)/total<=lowWater)&&free>=reserveBytes*1.1&&(!maxBytes||used<=maxBytes*lowWater);
   const result=()=>({usedBytes:used,freeBytes:free,totalBytes:total,deleted:planned,dryRun,backedUpDeleted:planned.filter(x=>x.backedUp).length,localOnlyDeleted:planned.filter(x=>!x.backedUp).length,blocked:!settled()});
   if(!over())return result();
   const candidates=(await entries(true)).filter(item=>now()-Date.parse(item.record.startedAt)>=minAgeMs);
   const passes=[candidates.filter(item=>uploaded.has(item.record.id))];if(!requireBackup)passes.push(candidates.filter(item=>!uploaded.has(item.record.id)));
   for(const pass of passes)for(const item of pass){
    if(settled())break;
    const path=await contained(item.file),info=await lstat(path);const event={at:new Date(now()).toISOString(),id:item.record.id,alias:item.record.alias,bytes:info.size,startedAt:item.record.startedAt,backedUp:uploaded.has(item.record.id)};
    if(!dryRun){await appendFile(join(base,'retention-events.ndjson'),JSON.stringify({...event,phase:'planned'})+'\n',{mode:0o600});await remove(item);await appendFile(join(base,'retention-events.ndjson'),JSON.stringify({...event,phase:'deleted'})+'\n',{mode:0o600});}
    planned.push(event);used-=info.size;free+=info.size;
   }
   cached=null;quotaCache=null;return result();
  })().finally(()=>{cleaning=null;});return cleaning;
 }
 // Moves files from older layouts (root, AAAA/MM/DD, <id>.mkv) to camera/day/time names without rewriting bytes.
 async function organizeLegacy({dryRun=false}={}){const moved=[];for(const item of await entries(true)){if(basename(dirname(item.metadata))===META&&dirname(item.file)===folder(item.record.alias,item.record.startedAt))continue;await contained(item.file);if(!dryRun){const {dir,name}=await reserveName(item.record.alias,item.record.startedAt);await mkdir(join(dir,META),{recursive:true,mode:0o700});const file=join(dir,name+'.mkv'),metadata=join(dir,META,name+'.json');await link(item.file,file);try{await writeFile(metadata,JSON.stringify({...item.record,file:name+'.mkv'},null,2),{flag:'wx',mode:0o600});}catch(e){await unlink(file);throw e;}await unlink(item.metadata);await unlink(item.file);await removeEmpty(dirname(item.file));}moved.push({id:item.record.id,alias:item.record.alias});}cached=null;quotaCache=null;return{moved,dryRun};}
 return{folder,reserveName,entries,find,usage,prune,organizeLegacy,invalidate(){cached=null;quotaCache=null;}};
}
