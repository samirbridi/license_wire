import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {PassThrough} from 'node:stream';
import {mkdtemp,mkdir,writeFile,readdir,rm,utimes,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,sep,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {createArchive,segmentStart} from '../camera-archive.mjs';

const alias='aw300_portao_quality3';
const id=name=>createHash('sha256').update(name).digest('hex').slice(0,32);
const probeJson={streams:[{codec_type:'video',codec_name:'hevc',width:2304,height:1296},{codec_type:'audio',codec_name:'opus',sample_rate:'48000',channels:2}],format:{duration:'775.68'}};
// Fake tools: ffprobe answers (or fails, like the timeout on the stalled NAS); ffmpeg is scripted per test.
function tools({probe=()=>({code:0,out:JSON.stringify(probeJson)}),ffmpeg=()=>{}}={}){
 return(command,args)=>{
  const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{setImmediate(()=>child.emit('close',255));};
  setImmediate(async()=>{
   if(command==='ffprobe'){const {code,out=''}=probe(args.at(-1));child.stdout.end(out);child.emit('close',code);}
   else{await ffmpeg(args,child);}
  });
  return child;
 };
}
async function withRoot(run){
 const root=await mkdtemp(join(tmpdir(),'mizin-recorder-test-'));
 try{await run(root);}finally{const absolute=resolve(root);if(!absolute.startsWith(resolve(tmpdir())+sep)||!absolute.split(sep).at(-1).startsWith('mizin-recorder-test-'))throw new Error('Unsafe test cleanup');await rm(absolute,{recursive:true,force:true});}
}
async function published(root){const files=[];for(const day of await readdir(join(root,'aw300_portao')).catch(()=>[]))for(const name of await readdir(join(root,'aw300_portao',day)))if(name.endsWith('.mkv'))files.push(day+'/'+name);return files.sort();}

test('segment start follows the clock mark even when the camera stalls',()=>{
 const step=900,mark=Date.parse('2026-10-30T17:00:00Z');
 // Normal segment: 900 s of stream closing ~2 s after the next mark.
 assert.equal(segmentStart({started:0,start:3600,end:4500,closedAt:mark+902000,segmentSeconds:step,clockAligned:true}),mark);
 // The doorbell segment of 2026-10-30: 7 min of wall clock, only 113 s of stream.
 assert.equal(segmentStart({started:0,start:106.319,end:219.717,closedAt:Date.parse('2026-10-30T17:07:05Z'),segmentSeconds:step,clockAligned:true}),mark);
 // Stream 20 s ahead of the wall clock (GOP replayed on join).
 assert.equal(segmentStart({started:0,start:900,end:1800,closedAt:mark+880000,segmentSeconds:step,clockAligned:true}),mark);
 // First segment of a run, or cuts not aligned to the clock: run start plus offset.
 assert.equal(segmentStart({started:1000,start:0,end:10,closedAt:0,segmentSeconds:step,clockAligned:true}),1000);
 assert.equal(segmentStart({started:1000,start:5,end:10,closedAt:0,segmentSeconds:step,clockAligned:false}),6000);
});

test('recover publishes a segment left in _work under the camera of its published sibling',()=>withRoot(async root=>{
 const run='0e923448e2ec44968a681dbaa888eaef',work=join(root,'_work'),sibling=`${run}-000000.partial.mkv`,orphan=`${run}-000001.partial.mkv`;
 await mkdir(join(root,'aw300_portao','2026-10-30','.meta'),{recursive:true});await mkdir(work);
 await writeFile(join(root,'aw300_portao','2026-10-30','13-52-02.mkv'),Buffer.alloc(10));
 await writeFile(join(root,'aw300_portao','2026-10-30','.meta','13-52-02.json'),JSON.stringify({id:id(sibling),alias,startedAt:'2026-10-30T16:52:02.000Z',file:'13-52-02.mkv'}));
 await writeFile(join(work,`${run}.segments.csv`),`${sibling},0.000000,106.317000\n${orphan},106.319000,219.717000\n`);
 await writeFile(join(work,orphan),Buffer.alloc(55));await utimes(join(work,orphan),new Date('2026-10-30T17:07:05Z'),new Date('2026-10-30T17:07:05Z'));
 // A segment still being written by another run is left alone.
 const fresh='1111111111111111111111111111111a-000003.partial.mkv';await writeFile(join(work,fresh),Buffer.alloc(5));
 // The NAS stalled: ffprobe fails, the footage is published anyway.
 const archive=createArchive({root,aliases:[alias],spawnProcess:tools({probe:()=>({code:1})})});
 const result=await archive.recover({now:Date.parse('2026-10-30T23:30:00Z')});
 assert.deepEqual(result.recovered.map(r=>[r.file,r.alias,r.startedAt]),[[orphan,alias,'2026-10-30T17:00:00.000Z']]);
 assert.deepEqual(result.skipped.map(r=>r.reason),['câmera desconhecida']);
 assert.deepEqual(await published(root),['2026-10-30/13-52-02.mkv','2026-10-30/14-00-00.mkv']);
 const record=(await archive.list()).find(r=>r.id===id(orphan));
 assert.equal(record.recovered,true);assert.equal(record.incomplete,true);assert.ok(Math.abs(record.duration-113.398)<0.01);assert.equal(record.bytes,55);
 assert.deepEqual(await readdir(work).then(n=>n.filter(x=>x.endsWith('.mkv'))),[fresh]);
}));

test('recover uses run.json for runs written by 0063 and skips recent files',()=>withRoot(async root=>{
 const run='22222222222222222222222222222222',work=join(root,'_work');await mkdir(work,{recursive:true});
 await writeFile(join(work,`${run}.run.json`),JSON.stringify({alias,startedAt:'2026-10-30T20:20:29.000Z',segmentSeconds:900,clockAligned:true}));
 await writeFile(join(work,`${run}-000000.partial.mkv`),Buffer.alloc(8));await utimes(join(work,`${run}-000000.partial.mkv`),new Date('2026-10-30T20:24:00Z'),new Date('2026-10-30T20:24:00Z'));
 await writeFile(join(work,`${run}-000001.partial.mkv`),Buffer.alloc(8));
 const archive=createArchive({root,aliases:[alias],spawnProcess:tools()});
 const result=await archive.recover({now:Date.parse('2026-10-30T20:30:00Z')});
 assert.deepEqual(result.recovered.map(r=>r.startedAt),['2026-10-30T20:20:29.000Z']);
 const record=(await archive.list())[0];assert.equal(record.incomplete,undefined);assert.equal(record.duration,775.68);
 const later=createArchive({root,aliases:[alias],spawnProcess:tools()});
 assert.equal((await later.recover({now:Date.now()+3600000})).recovered.length,1);
}));

test('a segment that fails its check is published and the recording keeps running',()=>withRoot(async root=>{
 let runFile=null;
 const ffmpeg=async(args,child)=>{
  const csv=args[args.indexOf('-segment_list')+1],pattern=args.at(-1);runFile=(await readdir(dirname(csv))).find(n=>n.endsWith('.run.json'));
  const lines=[];
  for(let n=0;n<3;n++){const file=pattern.replace('%06d',String(n).padStart(6,'0'));await writeFile(file,Buffer.alloc(20+n));lines.push(`${file},${n*2}.000000,${n*2+2}.000000`);await writeFile(csv,lines.join('\n')+'\n');child.stdout.write(`frame=${(n+1)*20}\n`);}
  child.stdout.end();setTimeout(()=>child.emit('close',0),50);
 };
 // The middle segment's check fails (as when ffprobe timed out on the stalled NAS).
 const archive=createArchive({root,aliases:[alias],spawnProcess:tools({ffmpeg,probe:file=>file.includes('-000001.')?{code:1}:{code:0,out:JSON.stringify(probeJson)}})});
 const segments=[];const result=await archive.continuous(alias,{segmentSeconds:2,clockAligned:false,onSegment:async r=>{segments.push(r);}});
 assert.equal(result.segments,3);assert.equal(segments.length,3);
 assert.deepEqual(segments.map(r=>r.incomplete===true),[false,true,false]);
 assert.equal(segments[1].duration,2);assert.match(segments[1].problem,/Falha/);
 assert.ok(runFile,'run.json written for recover()');
 assert.deepEqual((await readdir(join(root,'_work'))).filter(n=>n.endsWith('.mkv')),[]);
 assert.ok((await stat(join(root,'aw300_portao'))).isDirectory());
}));
