'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createProvider,estimate,payload,rateWait}=require('../lib/room-semantic-provider');
test('rate estimate includes the exact sent system/user messages and strict schema for each stage',async()=>{
  const item={itemName:'収納ボックス',itemCaption:'使わないときは折りたためる収納ボックス',catchcopy:'持ち手付き'};
  const state={draft:{product:{},sentences:[{text:'例文'}]},attempt:0};
  let body;
  const provider=createProvider({apiKey:'synthetic',fetchImpl:async(_,o)=>{body=JSON.parse(o.body);return {ok:true,headers:new Headers(),json:async()=>({choices:[{message:{content:'{}'}}]})};}});
  for(const stage of ['generate','verify']){
    const before=provider.requiredTokens(stage,item,state);
    await provider.call(stage,item,state);
    assert.equal(before,estimate({messages:body.messages,response_format:body.response_format},body.max_completion_tokens));
    const old=estimate(payload(stage,item,state),3000);
    assert.ok(before>old);
    const remaining=Math.floor((old+before)/2);
    assert.equal(rateWait({'x-ratelimit-remaining-tokens':String(remaining),'x-ratelimit-reset-tokens':'2s'},before),2000);
    assert.equal(body.max_completion_tokens,3000);
    assert.equal(body.reasoning_effort,'medium');
  }
});

test('recorded failed generation fits the observed window without removing source, feedback or output allowance',()=>{
  const record=require('../docs/measurements/room-copy-20261027-ipow-evidence-order.json').records[0];
  const item={itemName:record.item_name,itemCaption:record.item_caption_normalized,catchcopy:''};
  const state=record.state;
  const input=payload('generate',item,state);
  assert.equal(input.itemName,item.itemName);
  assert.equal(input.itemCaption,item.itemCaption);
  assert.deepEqual(input.feedback.previousDraft,state.previousDraft);
  assert.deepEqual(input.feedback.failures,state.failures);
  const required=createProvider({apiKey:'synthetic'}).requiredTokens('generate',item,state);
  assert.ok(required<=Number(state.headers['x-ratelimit-limit-tokens']),`estimate ${required} exceeds observed capacity`);
});
