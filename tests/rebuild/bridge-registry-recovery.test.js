'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Bridge=require('../../lib/urenavi-core/app-bridge'),Registry=require('../../lib/urenavi-core/completed-store'),C=require('../../lib/urenavi-core/contracts'),Copy=require('../../public/room-copy-result');
const rows=require('../../scripts/rebuild/app-preview/artifacts.json');
const seed=()=>structuredClone(rows[0]),args=()=>({environment:'preview',authorization:{ok:true,plan:'owner',user:{id:rows[0].owner}},item:structuredClone(rows[0].artifact.source)});
test('restored bridge boundary checks every completed envelope binding and each source field',async()=>{
 const result=await Bridge.create({loadCompleted:Registry.create(rows)})(args());assert.ok(Copy.ready(result));assert.equal(result.resourceUsage.calls,0);
 for(const mutate of [r=>r.owner='other',r=>r.artifact.status='pending',r=>r.artifact.version='old',r=>r.artifact.key='wrong',r=>r.artifact.conditions={changed:true},r=>r.artifact.output.sentences[0].text='altered']){
  const row=seed();mutate(row);await assert.rejects(()=>Bridge.create({loadCompleted:async()=>row})(args()));
 }
 for(const field of ['itemCode','itemName','itemCaption','catchcopy']){
  const a=args();a.item[field]+='changed';assert.equal(await Bridge.create({loadCompleted:Registry.create(rows)})(a),null);
 }
 for(const quality of C.axes){const row=seed();row.artifact.review.quality[quality].verdict='fail';await assert.rejects(()=>Bridge.create({loadCompleted:async()=>row})(args()));}
});
test('restored bridge rejects unauthorized contexts before loading and registry copies are isolated',async()=>{
 for(const a of [{...args(),environment:'production'},{...args(),authorization:{ok:false}},{...args(),authorization:{ok:true,plan:'free',user:{id:'x'}}},{...args(),authorization:{ok:true,plan:'owner',user:{}}}]){
  let reads=0;await assert.rejects(()=>Bridge.create({loadCompleted:async()=>{reads++;return seed();}})(a));assert.equal(reads,0);
 }
 assert.throws(()=>Bridge.create({}));assert.equal(await Bridge.create({loadCompleted:async()=>null})(args()),null);
 const row=seed(),load=Registry.create([row]);assert.throws(()=>Registry.create([row,row]));assert.throws(()=>Registry.create([{...row,artifact:{...row.artifact,status:'incomplete'}}]));
 const q={owner:row.owner,key:row.artifact.key,sourceHash:C.hash(C.source(row.artifact.source)),version:row.artifact.version};
 row.artifact.source.itemName='external mutation';const got=await load(q);assert.notEqual(got.artifact.source.itemName,row.artifact.source.itemName);got.artifact.source.itemName='caller mutation';assert.notEqual((await load(q)).artifact.source.itemName,got.artifact.source.itemName);
 assert.equal(await load({...q,owner:'another'}),null);assert.equal(await load({...q,version:'old'}),null);
});
