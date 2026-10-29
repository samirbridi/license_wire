import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,stat,access,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createArchiveIndex} from '../archive-index.mjs';
async function fixture(fn){const root=await mkdtemp(join(tmpdir(),'mizin-retention-test-'));try{await fn(root);}finally{const path=resolve(root);if(!path.startsWith(resolve(tmpdir())+sep)||!path.split(sep).at(-1).startsWith('mizin-retention-test-'))throw new Error('Unsafe cleanup');await rm(path,{recursive:true,force:true});}}
async function legacy(root,alias,at,bytes=70){const id=randomBytes(16).toString('hex'),record={id,alias,startedAt:at,bytes,source:'nas',container:'matroska'};await mkdir(root,{recursive:true});await writeFile(join(root,id+'.mkv'),Buffer.alloc(bytes));await writeFile(join(root,id+'.json'),JSON.stringify(record));return record;}
async function recording(index,alias,at,bytes=70){const id=randomBytes(16).toString('hex'),{dir,name}=await index.reserveName(alias,at),record={id,alias,startedAt:at,file:name+'.mkv',bytes,source:'nas',container:'matroska'};await mkdir(join(dir,'.meta'),{recursive:true});await writeFile(join(dir,name+'.mkv'),Buffer.alloc(bytes));await writeFile(join(dir,'.meta',name+'.json'),JSON.stringify(record));index.invalidate();return record;}
// Simulated volume: total and free follow the bytes the test writes or deletes.
const volume=(total,otherBytes=0)=>({total,usage:null,async disk(){return{total,free:total-otherBytes-await this.usage()};}});
test('one folder per camera and one per Brazilian day; files are named by local time and view',()=>fixture(async root=>{
 const index=createArchiveIndex({root,aliases:['outdoor_pro_poste_quality3','outdoor_pro_poste_channel2_quality3']});
 const one=index.folder('outdoor_pro_poste_quality3','2026-10-01T02:00:00.000Z'),two=index.folder('outdoor_pro_poste_channel2_quality3','2026-10-01T02:00:00.000Z');assert.equal(one,two);assert.equal(one,join(root,'outdoor_pro_poste','2026-09-30'));assert.throws(()=>index.folder('../foreign','2026-10-01'));
 assert.deepEqual(await index.reserveName('outdoor_pro_poste_quality3','2026-10-01T02:15:00.000Z'),{dir:one,name:'23-15-00'});
 assert.deepEqual(await index.reserveName('outdoor_pro_poste_channel2_quality3','2026-10-01T02:15:00.000Z'),{dir:one,name:'23-15-00_visao2'});
 const first=await recording(index,'outdoor_pro_poste_quality3','2026-10-01T02:15:00.000Z');assert.equal(first.file,'23-15-00.mkv');
 assert.equal((await index.reserveName('outdoor_pro_poste_quality3','2026-10-01T02:15:00.000Z')).name,'23-15-00_2');
 assert.deepEqual((await readdir(one)).sort(),['.meta','23-15-00.mkv']);const found=await index.find(first.id);assert.equal(found.file,join(one,'23-15-00.mkv'));
}));
test('legacy recordings migrate to camera/day/time without changing bytes or overwriting a destination',()=>fixture(async root=>{
 const index=createArchiveIndex({root,aliases:['camera_quality3']}),r=await legacy(root,'camera_quality3','2026-10-20T12:00:00Z');
 const before=await readFile(join(root,r.id+'.mkv'));assert.equal((await index.organizeLegacy({dryRun:true})).moved.length,1);await access(join(root,r.id+'.mkv'));
 assert.equal((await index.organizeLegacy()).moved.length,1);const located=await index.find(r.id);assert.equal(located.file,join(root,'camera','2026-10-20','09-00-00.mkv'));assert.deepEqual(await readFile(located.file),before);await assert.rejects(()=>access(join(root,r.id+'.mkv')));assert.equal((await index.organizeLegacy()).moved.length,0);
 const old=join(root,'camera','2026','10','20');await mkdir(old,{recursive:true});const id=randomBytes(16).toString('hex');await writeFile(join(old,id+'.mkv'),Buffer.from('second'));await writeFile(join(old,id+'.json'),JSON.stringify({id,alias:'camera_quality3',startedAt:'2026-10-20T12:00:00Z'}));
 assert.equal((await index.organizeLegacy()).moved.length,1);assert.deepEqual(await readFile(located.file),before);assert.equal((await readFile(join(root,'camera','2026-10-20','09-00-00_2.mkv'),'utf8')),'second');await assert.rejects(()=>access(join(root,'camera','2026')));
}));
test('without a fixed limit the volume is used until 90%, then the oldest recordings go first',()=>fixture(async root=>{
 const now=Date.parse('2026-10-28T12:00:00Z'),v=volume(1000,440),index=createArchiveIndex({root,aliases:['owned'],now:()=>now,disk:()=>v.disk()});v.usage=()=>index.usage({force:true});const records=[];for(let day=20;day<26;day++)records.push(await recording(index,'owned',`2026-10-${day}T12:00:00Z`));
 const calm=await index.prune({reserveBytes:0});assert.equal(calm.deleted.length,0);
 records.push(await recording(index,'owned','2026-10-26T12:00:00Z'));
 const plan=await index.prune({reserveBytes:0,dryRun:true});assert.equal(plan.deleted.length,2);assert.equal((await index.entries(true)).length,7);
 const result=await index.prune({reserveBytes:0});assert.deepEqual(result.deleted.map(x=>x.id),records.slice(0,2).map(x=>x.id));assert.equal(result.localOnlyDeleted,2);assert.equal((await index.entries(true)).length,5);await access(root);assert.equal((await readFile(join(root,'retention-events.ndjson'),'utf8')).trim().split('\n').length,4);
 await assert.rejects(()=>access(join(root,'owned','2026-10-20')));
}));
test('copies confirmed in R2 are freed first; requireBackup never erases a local-only file',()=>fixture(async root=>{
 const now=Date.parse('2026-10-28T12:00:00Z'),v=volume(1000,500),index=createArchiveIndex({root,aliases:['owned'],now:()=>now,disk:()=>v.disk()});v.usage=()=>index.usage({force:true});const records=[];for(let day=20;day<27;day++)records.push(await recording(index,'owned',`2026-10-${day}T12:00:00Z`));
 const uploaded=new Set([records[3].id,records[4].id]);
 const result=await index.prune({reserveBytes:0,uploaded,dryRun:true});assert.deepEqual(result.deleted.map(x=>x.id),[records[3].id,records[4].id]);assert.equal(result.backedUpDeleted,2);
 const strict=await index.prune({reserveBytes:0,uploaded:new Set(),requireBackup:true});assert.equal(strict.deleted.length,0);assert.equal(strict.blocked,true);assert.equal((await index.entries(true)).length,7);
}));
test('partial files and unrecognized data count toward the quota but are never erased',()=>fixture(async root=>{
 const index=createArchiveIndex({root,aliases:['owned'],disk:async()=>({total:0,free:1e12})});await legacy(root,'owned','2026-01-01T00:00:00Z',70);await writeFile(join(root,'active.partial.mkv'),Buffer.alloc(40));await writeFile(join(root,'family-original.mkv'),Buffer.alloc(100));
 const result=await index.prune({maxBytes:200,highWater:.9,lowWater:.5,reserveBytes:0,minAgeMs:0});assert.equal(result.deleted.length,1);assert.equal((await stat(join(root,'active.partial.mkv'))).size,40);assert.equal((await stat(join(root,'family-original.mkv'))).size,100);assert.equal(await index.usage({force:true}),140);
}));
test('recent recordings inside the safety window are never rotated',()=>fixture(async root=>{
 const now=Date.parse('2026-10-28T12:00:00Z'),index=createArchiveIndex({root,aliases:['owned'],now:()=>now,disk:async()=>({total:100,free:1})});await recording(index,'owned','2026-10-28T11:55:00Z');
 const result=await index.prune({reserveBytes:0});assert.equal(result.deleted.length,0);assert.equal(result.blocked,true);
}));
