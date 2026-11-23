import test from 'node:test';
import assert from 'node:assert/strict';
import { edition } from '../manager/prepare-edition.mjs';

const makeNode=(id)=>({class:{id},bounds:{x:0,y:0,width:100},constants:{}});
const out=()=>makeNode('77697265-BEEA-4D38-8EE5-0EBA4CBD0AEE');
const original={patch:{nodes:{0:makeNode('texture'),1:out(),12:out()},nextNodeId:20,
  connections:[{from:[0,'pixels'],to:[1,'input']},{from:[0,'pixels'],to:[12,'input']}],
  inputOrder:[0],meta:{identifier:'source-id',displayName:'Original'}},resources:{shader:'Resources/a.fs'}};
const template={patch:{nodes:Object.fromEntries([2,3,4,5,6,7].map(i=>[i,makeNode(String(i))]))}};
template.patch.nodes[3].constants.address={value:''};
const chan='ab'.repeat(16);

test('cada saída recebe a sua composição e a edição pública tem marca fixa',()=>{
  const before=structuredClone(original);
  const demo=edition(original,template,'product','build',chan,true);
  const paid=edition(original,template,'product','build',chan,false);
  assert.deepEqual(original,before);
  assert.deepEqual(paid.resources,original.resources);
  assert.deepEqual(paid.patch.inputOrder,original.patch.inputOrder);
  assert.notEqual(demo.patch.meta.identifier,original.patch.meta.identifier);
  assert.equal(paid.patch.meta.identifier,original.patch.meta.identifier);
  assert.ok(!JSON.stringify(demo).includes(chan));
  assert.ok(!demo.patch.connections.some(e=>e.to[1]==='opacity2'));
  assert.equal(paid.patch.connections.filter(e=>e.to[1]==='opacity2').length,2);
  assert.ok(Object.values(paid.patch.nodes).some(n=>n.constants.address?.value.endsWith('/'+chan)));
  for(const graph of [demo.patch,paid.patch]){
    for(const id of [1,12]){
      const edges=graph.connections.filter(e=>e.to[0]===id);
      assert.equal(edges.length,1);
      assert.equal(graph.nodes[edges[0].from[0]].class.id,'7');
    }
  }
  assert.throws(()=>edition(paid,template,'product','build',chan,false),/já contém/);
  assert.throws(()=>edition({...original,patch:{...original.patch,connections:[]}},template,'product','build',chan,true),/conexão/);
});
