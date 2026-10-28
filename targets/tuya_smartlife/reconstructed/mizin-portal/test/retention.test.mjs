import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,stat,access,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {randomBytes} from 'node:crypto';
import {createArchiveIndex} from '../archive-index.mjs';
async function fixture(fn){const root=await mkdtemp(join(tmpdir(),'mizin-retention-test-'));try{await fn(root);}finally{const path=resolve(root);if(!path.startsWith(resolve(tmpdir())+sep)||!path.split(sep).at(-1).startsWith('mizin-retention-test-'))throw new Error('Unsafe cleanup');await rm(path,{recursive:true,force:true});}}
async function recording(root,alias,at,bytes=70){const id=randomBytes(16).toString('hex'),record={id,alias,startedAt:at,bytes,source:'nas',container:'matroska'};await mkdir(root,{recursive:true});await writeFile(join(root,id+'.mkv'),Buffer.alloc(bytes));await writeFile(join(root,id+'.json'),JSON.stringify(record));return record;}
test('camera folders use the Brazilian date and keep both Outdoor views together',()=>fixture(async root=>{
 const index=createArchiveIndex({root,aliases:['outdoor_pro_poste_quality3','outdoor_pro_poste_channel2_quality3']});
 const one=index.folder('outdoor_pro_poste_quality3','2026-10-01T02:00:00.000Z'),two=index.folder('outdoor_pro_poste_channel2_quality3','2026-10-01T02:00:00.000Z');assert.equal(one,two);assert.equal(one,join(root,'outdoor_pro_poste','2026','09','30'));assert.throws(()=>index.folder('../foreign','2026-10-01'));
}));
test('legacy recordings migrate without changing bytes or overwriting a destination',()=>fixture(async root=>{
 const index=createArchiveIndex({root,aliases:['camera_quality3']}),r=await recording(root,'camera_quality3','2026-10-20T12:00:00Z');
 const before=await readFile(join(root,r.id+'.mkv'));assert.equal((await index.organizeLegacy({dryRun:true})).moved.length,1);await access(join(root,r.id+'.mkv'));
 assert.equal((await index.organizeLegacy()).moved.length,1);const located=await index.find(r.id);assert.deepEqual(await readFile(located.file),before);await assert.rejects(()=>access(join(root,r.id+'.mkv')));assert.equal((await index.organizeLegacy()).moved.length,0);
 const conflict=await recording(root,'camera_quality3','2026-10-20T12:00:00Z');await writeFile(join(index.folder(conflict.alias,conflict.startedAt),conflict.id+'.mkv'),Buffer.from('existing'));await assert.rejects(()=>index.organizeLegacy(),{code:'EEXIST'});assert.equal((await stat(join(root,conflict.id+'.mkv'))).size,70);
}));
test('rotation deletes oldest completed recordings only, records an audit and preserves the root',()=>fixture(async root=>{
 const now=Date.parse('2026-10-28T12:00:00Z'),index=createArchiveIndex({root,aliases:['owned'],now:()=>now}),records=[];for(let day=20;day<23;day++)records.push(await recording(root,'owned',`2026-10-${day}T12:00:00Z`));
 const plan=await index.prune({maxBytes:200,highWater:.9,lowWater:.5,reserveBytes:0,dryRun:true});assert.equal(plan.deleted.length,2);assert.equal((await index.entries(true)).length,3);
 const result=await index.prune({maxBytes:200,highWater:.9,lowWater:.5,reserveBytes:0});assert.deepEqual(result.deleted.map(x=>x.id),records.slice(0,2).map(x=>x.id));assert.equal((await index.entries(true)).length,1);await access(root);assert.equal((await readFile(join(root,'retention-events.ndjson'),'utf8')).trim().split('\n').length,4);
}));
test('partial files and unrecognized data count toward the quota but are never erased',()=>fixture(async root=>{
 const index=createArchiveIndex({root,aliases:['owned']});await recording(root,'owned','2026-01-01T00:00:00Z',70);await writeFile(join(root,'active.partial.mkv'),Buffer.alloc(40));await writeFile(join(root,'family-original.mkv'),Buffer.alloc(100));
 const result=await index.prune({maxBytes:200,highWater:.9,lowWater:.5,reserveBytes:0,minAgeMs:0});assert.equal(result.deleted.length,1);assert.equal((await stat(join(root,'active.partial.mkv'))).size,40);assert.equal((await stat(join(root,'family-original.mkv'))).size,100);assert.equal(await index.usage({force:true}),140);
}));
