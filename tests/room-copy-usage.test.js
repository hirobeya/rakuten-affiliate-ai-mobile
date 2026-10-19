'use strict';const {test}=require('node:test'),assert=require('node:assert/strict'),{measure,summarize}=require('../lib/room-copy-cost');
test('request usage totals measured stages without exposing account hash or claiming invoice',()=>{const row=measure({owner:'private@example.test',model:'openai/gpt-oss-120b',usage:{prompt_tokens:100,completion_tokens:50},elapsedMs:10});const s=summarize([row,row]);assert.equal(s.calls,2);assert.equal(s.inputTokens,200);assert.equal(s.outputTokens,100);assert.equal(s.providerElapsedMs,20);assert.equal(s.chargedUsd,null);assert.ok(!JSON.stringify(s).includes('account'));});
test('failed call with unknown usage makes total unknown rather than dropping consumption',()=>{const s=summarize([measure({model:'openai/gpt-oss-120b',usage:{prompt_tokens:100,completion_tokens:50}}),measure({model:'openai/gpt-oss-120b',failed:true})]);assert.equal(s.calls,2);assert.equal(s.failedCalls,1);assert.equal(s.inputTokens,null);assert.equal(s.estimatedUsd,null);});
test('local and cached requests have measured zero provider calls',()=>{const s=summarize([measure({model:'local',calls:0})]);assert.equal(s.calls,0);assert.equal(s.inputTokens,0);assert.equal(s.estimatedUsd,0);assert.equal(s.chargedUsd,null);});
test('provider failure diagnostics preserve status and stop once without leaking provider details',async()=>{
 const {meteredProvider}=require('../lib/room-copy-cost');
 for(const [status,kind] of [[401,'provider_auth'],[403,'provider_auth'],[429,'rate_limit'],[400,'provider_request'],[503,'provider_error']]){
  const rows=[];let calls=0;const error=Object.assign(new Error('private provider detail'),{status,headers:{Authorization:'private credential'}});
  const provider=meteredProvider({model:'test',call:async()=>{calls++;throw error;}},{log:r=>rows.push(r)});
  await assert.rejects(()=>provider.call('generate',{itemCaption:'private source'},{}),e=>e===error);
  assert.equal(calls,1);assert.equal(rows[0].upstreamStatus,status);assert.equal(rows[0].failureKind,kind);
  assert.ok(!JSON.stringify(rows).includes('private'));assert.equal(rows[0].inputTokens,null);assert.equal(rows[0].chargedUsd,null);
 }
});
