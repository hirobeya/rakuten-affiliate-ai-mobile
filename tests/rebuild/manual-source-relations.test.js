'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {generate}=require('../../lib/manual-room-copy');
const {compose,verify}=require('../../lib/manual-purchase-reason');
const {createCapacityV2}=require('../../lib/urenavi-core/multitenant-capacity-v2-adapter');
const items=require('../../docs/evaluations/20261120-source-relations/manual-inputs.json');

test('new handwritten use cases preserve original subject and semantic spans',()=>{
 for(const item of items.slice(0,5)){
  const out=compose(item);
  assert.equal(generate(item)?.path,'source_relation',item.id);
  for(const key of ['scene','feature','benefit']){
   const span=out.proof[key];
   assert.equal(item.itemCaption.slice(span.start,span.end),span.quote);
  }
  assert.ok(verify(item,out.proof,out.text));
 }
 const [,,mill,,clip]=items;
 const proof=compose(clip);
 assert.deepEqual(proof.proof.feature.numbers,['6mm']);
 for(const text of [
  proof.text.replace('6mm','8mm'),proof.text.replace('以下','未満'),
  proof.text.replace('ケーブルクリップ','ケーブルホルダー'),
  proof.text.replace('機器を替える','外に持ち出す'),
  proof.text.replace('留めておけます','強く留めておけます')
 ]) assert.equal(verify(clip,proof.proof,text),false,text);
 const negated=compose(mill);
 assert.ok(negated.proof.benefit.negations.includes('なくても'));
 assert.equal(verify(mill,negated.proof,negated.text.replace('なくても','てから')),false);
});
test('unsafe, ungrounded or ambiguous purchase reasons do not escape through a fallback',()=>{
 for(const item of items.slice(5))assert.equal(generate(item),null,item.id);
 assert.equal(generate({...items[0],itemCaption:items[0].itemCaption+'\nふたに押しボタンはありません。'}),null);
});

const authorization={ok:true,plan:'base',user:{id:'11111111-1111-4111-8111-111111111111',email:'test@example.invalid'}};
const request={authorization,model:'openai/gpt-oss-120b',item:{itemCode:'TEST',...items[0]},stage:'generate',state:{attempt:0},estimate:50};
test('v2 seam uses verified tenant and atomic pre-send receipt, then persists 429',async()=>{
 const calls=[];
 const backend=createCapacityV2({db:async(path,{body})=>{calls.push([path,JSON.parse(body)]);return true;}});
 assert.equal(await backend.reserve({...request,authorization:{...authorization,plan:'free'}}),null);
 const reservation=await backend.reserve(request);
 assert.equal(await reservation.settle({status:200,actualTokens:12}),false);
 assert.equal(await reservation.markSendIntent(),true);
 assert.equal(await reservation.markSendIntent(),false);
 assert.equal(await reservation.settle({status:429}),true);
 assert.equal(await reservation.settle({status:429}),false);
 assert.deepEqual(calls.map(([path])=>path),['rpc/urenavi_capacity_reserve_v2','rpc/urenavi_capacity_intent_v2','rpc/urenavi_capacity_complete_v2']);
 assert.ok(calls.every(([,body])=>body.p_tenant===authorization.user.id&&body.p_id===calls[0][1].p_id));
 assert.equal(calls[2][1].p_outcome,'rate_limited');
 assert.equal(calls[2][1].p_actual,null);
});
test('v2 seam holds missing receipts and unknown spend',async()=>{
 let intents=0;
 const backend=createCapacityV2({db:async path=>{
  if(path.includes('_intent_')){intents++;throw Error('unknown receipt');}
  return true;
 }});
 const reservation=await backend.reserve(request);
 assert.equal(await reservation.markSendIntent(),false);
 assert.equal(await reservation.markSendIntent(),false);
 assert.equal(await reservation.settle({status:200,actualTokens:5}),false);
 assert.equal(intents,1);
 let payload;
 const known=createCapacityV2({db:async(path,{body})=>{
  if(path.includes('_complete_'))payload=JSON.parse(body);
  return true;
 }});
 const second=await known.reserve(request);
 assert.equal(await second.markSendIntent(),true);
 assert.equal(await second.settle({status:200}),true);
 assert.equal(payload.p_outcome,'unknown');
 assert.equal(payload.p_actual,null);
});
