import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const outputClass = '77697265-beea-4d38-8ee5-0eba4cbd0aee';
const clone = value => structuredClone(value);

export function edition(original, prototype, product, release, channel, demo) {
  const document = clone(original);
  const graph = document.patch;
  if (!graph?.nodes || !Array.isArray(graph.connections)) throw Error('Projeto Wire inválido.');
  if (!/^[a-z0-9_-]+$/.test(product) || !/^[a-z0-9_-]+$/.test(release) || !/^[a-f0-9]{32}$/.test(channel)) throw Error('Identidade da edição inválida.');
  const nodes = Object.entries(graph.nodes);
  if (nodes.some(([,node])=>String(node.constants?.address?.value || '').startsWith('/mizin/wire/'))) throw Error('O projeto já contém integração Mizin. Use a fonte original.');
  const outputs = nodes.filter(([,node])=>node.class.id.toLowerCase()===outputClass);
  if (!outputs.length) throw Error('O projeto precisa de uma saída de textura.');
  let next = Math.max(graph.nextNodeId || 0, ...nodes.map(([id])=>Number(id)+1));
  const layoutX = Math.max(0,...nodes.map(([,node])=>node.bounds.x+node.bounds.width))+100;
  function insert(id, column, row) {
    const node = clone(prototype.patch.nodes[id]);
    node.bounds.x=layoutX+column*240;
    node.bounds.y=row*220;
    graph.nodes[next]=node;
    return next++;
  }
  function connect(from,outlet,to,inlet) {graph.connections.push({from:[from,outlet],to:[to,inlet]});}
  let opacity;
  if (!demo) {
    const osc=insert(2,0,0), read=insert(3,1,0), envelope=insert(4,2,0);
    graph.nodes[read].constants.address.value='/mizin/wire/'+product+'/'+release+'/'+channel;
    opacity=insert(5,3,0);
    connect(osc,'output',read,'osc'); connect(read,'on-read',envelope,'trigger'); connect(envelope,'output',opacity,'input0');
  }
  const text=insert(6,3,1);
  for (const [index,[id]] of outputs.entries()) {
    const feeds=graph.connections.filter(edge=>String(edge.to[0])===id && edge.to[1]==='input');
    if (feeds.length!==1) throw Error('Cada Texture Out precisa de uma conexão de entrada.');
    const mixer=insert(7,4,index);
    feeds[0].to=[mixer,'input1'];
    connect(text,'output',mixer,'input2');
    if (!demo) connect(opacity,'output0',mixer,'opacity2');
    connect(mixer,'output',Number(id),'input');
  }
  graph.nextNodeId=next;
  if (demo) {
    const bytes=createHash('sha256').update('mizin-demo/'+graph.meta.identifier+'/'+product).digest().subarray(0,16);
    bytes[6]=(bytes[6]&15)|80; bytes[8]=(bytes[8]&63)|128;
    graph.meta.identifier=bytes.toString('hex').replace(/^(........)(....)(....)(....)(............)$/,'$1-$2-$3-$4-$5');
    graph.meta.displayName+=' · Demo';
  }
  return document;
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const [source,probe,product,release,channel,demo,managed]=process.argv.slice(2);
  const read = path=>JSON.parse(readFileSync(path,'utf8').replace(/^\uFEFF/,''));
  const original=read(source), prototype=read(probe);
  for (const [path,isDemo] of [[demo,true],[managed,false]]) {
    writeFileSync(path,JSON.stringify(edition(original,prototype,product,release,channel,isDemo)),{flag:'wx'});
  }
}
