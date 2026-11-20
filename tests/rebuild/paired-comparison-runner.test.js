'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {generateKeyPairSync,sign}=require('node:crypto');
const {createComparisonRunner,createGroqComparisonTransport,expectedApproval}=require('../../lib/urenavi-core/paired-comparison-runner');
const {createComparisonJournal}=require('../../lib/urenavi-core/comparison-journal');
const {prepareReport,hash,MODEL}=require('../../lib/urenavi-core/generation-comparison');

const item={itemCode:'test:case',itemName:'収納ボックス',itemCaption:
 '収納ボックスは、仕切りが付いています。\nそのため、食材を分けて収納できます。',itemPrice:1200};
const sourceHash=hash([item.itemName,item.itemCaption,item.itemPrice]);
const index=[{itemCode:item.itemCode,category:'storage',inputSha256:sourceHash}];
const inputs=[{item,category:'storage'}];
const plan=prepareReport(index,inputs,{rates:{inputPerMillion:0.15,outputPerMillion:0.6}});
const auth={ok:true,plan:'owner',user:{id:'11111111-1111-4111-8111-111111111111',email:'owner@example.invalid'}};
const sha='a'.repeat(40);
const account={organization:'test',project:'test',credentialSha256:'c'.repeat(64)};
const now=Date.parse('2026-11-20T08:00:00Z');
const signed=(payload,key)=>({payload,signature:sign(null,Buffer.from(JSON.stringify(payload)),key).toString('base64')});
const approvalKeys=generateKeyPairSync('ed25519');
const evidenceKeys=generateKeyPairSync('ed25519');
const scope=expectedApproval(sha,auth.user.id,account,plan);
const approvalEnvelope=signed({approvalId:'b'.repeat(64),expiresAt:new Date(now+300000).toISOString(),scope},approvalKeys.privateKey);
const usage={prompt_tokens:1500,completion_tokens:400,total_tokens:1900};
const draft={product:{what:'収納ボックス',acts_on:'食材を分けて収納',acts_on_quote:'食材を分けて収納できます'},
 sentences:[{text:'仕切りの付いた収納ボックスで、食材を分けて収納できます。',
  quotes:['収納ボックス','仕切りが付いています','食材を分けて収納できます'],kinds:['spec','benefit']}]};
const review={product:{what:'supported',acts_on:'supported'},sentences:[{
 text:draft.sentences[0].text,evidenceQuotes:draft.sentences[0].quotes,reason:'literal source',
 target:'supported',part:'supported',conditions:'supported',negation:'supported',degree:'supported'
}],quality:{identity:'supported',reason:'supported',scene:'supported',natural:'supported',non_redundant:'supported',room_style:'supported'}};
const stage=(overrides={})=>({approvalEnvelope,itemCode:item.itemCode,arm:'B',stage:'generate',...overrides});
const provider=(raw=draft)=>({status:200,model:MODEL,providerRequestId:'simulated',raw,usage});

async function fixture(t,{answer,dbResult=()=>true,evidencePatch={},failSave=false}={}){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'paired-comparison-'));
 t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const plain=createComparisonJournal(directory);
 const journal={...plain,async create(key,value){
  if(failSave&&key.endsWith('-result'))throw Error('disk unavailable');
  return plain.create(key,value);
 }};
 let observed=0;
 const evidence=patch=>({
  source:'groq_console',artifactSha256:hash(++observed),model:MODEL,account,plan:'free',billable:false,
  exclusiveWindow:true,unresolvedSends:0,verifiedAt:new Date(now).toISOString(),
  minute:{remainingRequests:10,remainingTokens:8000,end:new Date(now+30000).toISOString()},
  day:{remainingRequests:50,remainingTokens:40000,end:new Date(now+300000).toISOString()},...patch
 });
 const rpc=[],calls=[];
 const make=()=>createComparisonRunner({
  environment:'isolated',inputs,executionSha:sha,account,authorize:async()=>auth,now:()=>now,
  approvalKey:approvalKeys.publicKey,evidenceKey:evidenceKeys.publicKey,journal,
  readEvidence:async()=>signed(evidence(evidencePatch),evidenceKeys.privateKey),
  db:async(route,{body})=>{const args=JSON.parse(body);rpc.push([route,args]);return dbResult(route,args);},
  transport:async body=>{calls.push(body);return answer?answer(body):provider();}
 },index,plan);
 return {runner:make(),make,journal,rpc,calls,evidence};
}
test('missing or altered approval and unknown capacity never reserve or send',async t=>{
 const f=await fixture(t,{evidencePatch:{day:null}});
 assert.equal((await f.runner.run(stage({approvalEnvelope:null}))).reason,'approval_invalid_or_expired');
 const altered={...approvalEnvelope,payload:{...approvalEnvelope.payload,expiresAt:new Date(now+500000).toISOString()}};
 assert.equal((await f.runner.run(stage({approvalEnvelope:altered}))).reason,'approval_invalid_or_expired');
 assert.equal((await f.runner.run(stage())).reason,'official_capacity_unverified_or_insufficient');
 assert.equal(f.calls.length,0);
 assert.equal(f.rpc.length,0);
});
test('writer and verifier persist exact results and separately settle each slot once',async t=>{
 const f=await fixture(t,{answer:b=>provider(b.response_format.json_schema.name==='room_final_review'?review:draft)});
 assert.equal(plan.paired.maximumCalls,4);
 assert.equal((await f.runner.run(stage({stage:'verify'}))).reason,'matching_settled_writer_required');
 const writer=await f.runner.run(stage());
 assert.equal(writer.status,'completed');
 assert.equal((await f.journal.read(writer.attemptId+'-result')).usage.total,1900);
 assert.equal((await f.make().run(stage())).reason,'duplicate_attempt');
 const verifier=await f.runner.run(stage({stage:'verify'}));
 assert.equal(verifier.publication.publication,'ready');
 assert.equal(f.calls.length,2);
 assert.deepEqual(f.rpc.map(([r])=>r.split('capacity_')[1]),
  ['reserve_v2','comparison_intent_v2','complete_v2','reserve_v2','comparison_intent_v2','complete_v2']);
 assert.notEqual(f.rpc[0][1].p_id,f.rpc[3][1].p_id);
});
test('unconfirmed durable send intent and concurrent lock never call the provider',async t=>{
 const f=await fixture(t,{dbResult:r=>!r.includes('comparison_intent')});
 const release=await f.journal.lock();
 assert.equal((await f.runner.run(stage())).reason,'journal_or_runtime_unavailable');
 await release();
 assert.equal((await f.runner.run(stage())).reason,'durable_send_intent_unconfirmed');
 assert.equal((await f.make().run(stage({arm:'C'}))).reason,'study_halted');
 assert.equal(f.calls.length,0);
});
for(const [name,opts,status] of [
 ['429',{answer:()=>({status:429})},'rate_limited'],
 ['timeout',{answer:()=>{throw Error('timeout');}},'unknown'],
 ['unknown usage',{answer:()=>({...provider(),usage:null})},'unknown'],
 ['save failure',{failSave:true},'unknown']
]){
 test(name+' uses one mock send, halts, and holds the original slot',async t=>{
  const f=await fixture(t,opts);
  const result=await f.runner.run(stage());
  assert.equal(result.status,'stopped');
  assert.equal(f.calls.length,1);
  assert.equal(f.rpc.at(-1)[1].p_outcome,status);
  assert.equal((await f.make().run(stage({arm:'C'}))).reason,'study_halted');
  const capture=f.evidence({executionSha:sha,tenant:auth.user.id,studyId:plan.studyId,
   reconciled:true,attemptIds:[scope.slots[0].attemptIds.writer]});
  assert.equal((await f.runner.recover({recoveryEnvelope:signed(capture,evidenceKeys.privateKey)})).status,'recovered');
  assert.equal((await f.make().run(stage())).reason,'duplicate_attempt');
  assert.equal(f.calls.length,1);
 });
}
test('the one-shot transport times out without issuing a second request',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 let calls=0,seenSignal;
 const send=createGroqComparisonTransport({apiKey:'fake',fetchImpl:async(_url,{signal})=>{
  calls++;seenSignal=signal;return new Promise(()=>{});
 }});
 const outcome=assert.rejects(send({model:MODEL}),/comparison_timeout/);
 t.mock.timers.tick(10000);
 await outcome;
 assert.equal(calls,1);
 assert.equal(seenSignal.aborted,true);
});
