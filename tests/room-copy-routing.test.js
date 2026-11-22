'use strict';
const assert=require('node:assert/strict');
const test=require('node:test');
const {createHash}=require('node:crypto');
const {createHandler}=require('../lib/super-urenavi-router');
const items=require('./fixtures/room-copy-routing-products.json');

const user={id:'11111111-1111-4111-8111-111111111111',email:'owner@example.invalid'};
const auth={ok:true,plan:'owner',user};
const mockKey='offline-key';
const quote='精密な注ぎ口のデザインにより、水流の量や速度のコントロールを初心者でも簡単に調整できます。';
const confirmed={productType:{value:'電気ケトル',source:'itemName',evidence:'電気ケトル'},
  features:[{text:quote,evidence:quote,source:'itemCaption'}],sellingPoints:[],confidence:'high'};
const ok={raw:confirmed,usage:{prompt_tokens:220,completion_tokens:85}};
const legacyLocal={model:'local',result_status:'ok',raw_ai_json:{...confirmed,features:[]}};

function environment(t){
  const keys=['VERCEL_ENV','GROQ_API_KEY','URENAVI_ROOM_COPY_FREE_EVIDENCE','VERCEL_GIT_COMMIT_SHA'];
  const previous=keys.map(key=>[key,process.env[key]]);
  t.after(()=>{for(const [key,value] of previous){
    if(value===undefined)delete process.env[key];else process.env[key]=value;
  }});
  process.env.VERCEL_ENV='preview';
  process.env.GROQ_API_KEY=mockKey;
  process.env.URENAVI_ROOM_COPY_FREE_EVIDENCE=JSON.stringify({plan:'free',approved:true,
    keyHash:createHash('sha256').update(mockKey).digest('hex'),evidenceHash:'a'.repeat(64),
    verifiedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+30000).toISOString()});
}

function fixture({reply=ok,prior=legacyLocal,policy={},authorize=async()=>auth}={}){
  const paths=[],attempts=new Set();
  let row=prior,sends=0;
  const run=createHandler({authorize,capacityDb:async(path,{body})=>{
    paths.push(path);
    const {p_id:id}=JSON.parse(body);
    if(path.endsWith('_reserve_v2'))return policy.reserve!==false&&!attempts.has(id);
    if(path.endsWith('_intent_v2')&&policy.intent!==false){attempts.add(id);return true;}
    return path.endsWith('_complete_v2')&&policy.complete!==false;
  },store:{
    loadProduct:async()=>row,
    saveProduct:async x=>{
      if(policy.save===false)throw Error('write unavailable');
      row={model:x.model,result_status:x.resultStatus,raw_ai_json:x.rawAiJson};
    }
  },callGroq:async opts=>{
    sends++;
    assert.equal(opts.maxRetries,0);
    assert.ok(opts.copyReview===true||opts.roomCopyTrial===true);
    if(reply instanceof Error)throw reply;
    return reply;
  }});
  return {paths,get sends(){return sends;},async request(item,extras={}){
    const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;}};
    await run({method:'POST',body:{...item,purpose:'room-copy',...extras}},res);
    return res;
  }};
}

test('A is local, B completes via v2 despite analysis cache, C and D stop before reservation',async t=>{
  environment(t);
  const a=fixture();
  const local=await a.request(items.A);
  assert.equal(local.body.copyStatus,'ready');
  assert.equal(local.body.route.route,'local');
  assert.equal(a.paths.length,0);
  const b=fixture();
  const analysis=await b.request(items.B,{purpose:undefined});
  assert.equal(analysis.body.route.route,'cache');
  assert.equal(b.sends,0);
  const ready=await b.request(items.B);
  assert.equal(ready.body.copyStatus,'ready');
  assert.equal(ready.body.route.route,'text');
  assert.ok(ready.body.sourceCopy.text.includes('水流の量や速度を初心者でも簡単に調整できます。'));
  assert.equal(ready.body.sourceCopy.proof.literal.quote,quote);
  for(const span of ready.body.sourceCopy.proof.evidence){
    assert.equal(items.B.itemCaption.slice(span.start,span.end),span.quote);
  }
  assert.equal((await b.request(items.B)).body.route.route,'cache');
  assert.equal(b.sends,1);
  assert.equal(b.paths.length,3);
  for(const item of [items.C,items.D,{...items.B,itemCaption:items.B.itemCaption+' 別売品の説明。'}]){
    const f=fixture({prior:null});
    assert.equal((await f.request(item)).body.copyStatus,'stopped');
    assert.equal(f.paths.length,0);
  }
});

test('post validation rejects unsupported, other-product, altered, unknown and malformed payloads',async t=>{
  environment(t);
  const change=text=>({...confirmed,features:[{text,evidence:quote,source:'itemCaption'}]});
  for(const raw of [
    change('火傷を予防できます。'),change('別売品は湯量を調整できます。'),
    change(quote.replace('初心者でも','全員が')),change(quote+'710mL'),
    {...confirmed,productType:{value:'不明',evidence:'不明',source:'itemName'}},
    {...confirmed,text:'モデルの自由作文'},
    {...confirmed,features:[{...confirmed.features[0],start:0,end:quote.length}]},'{"productType":',null
  ]){
    const f=fixture({reply:{...ok,raw}});
    const response=await f.request(items.B);
    assert.equal(response.body.copyStatus,'stopped');
    assert.equal(response.body.sourceCopy,null);
    await f.request(items.B);
    assert.equal(f.sends,1);
  }
});

test('Free, authorization, reservation, uncertain results and previous provider cache are fail-closed',async t=>{
  environment(t);
  for(const policy of [{reserve:false},{intent:false}]){
    const f=fixture({policy});
    assert.equal((await f.request(items.B)).code,503);
    assert.equal(f.sends,0);
  }
  for(const input of [
    {reply:Object.assign(Error('429'),{status:429}),status:429},
    {reply:Error('provider timeout'),status:504},
    {reply:{...ok,usage:null},status:503},
    {policy:{complete:false},status:503},
    {policy:{save:false},status:200}
  ]){
    const f=fixture(input);
    const first=await f.request(items.B);
    assert.equal(first.code,input.status);
    assert.ok(!first.body.sourceCopy);
    const second=await f.request(items.B);
    assert.ok(!second.body.sourceCopy);
    assert.equal(f.sends,1);
  }
  const cached=fixture({prior:{model:'groq',result_status:'unknown',raw_ai_json:null}});
  assert.equal((await cached.request(items.B)).body.copyReason,'previous_result_not_publishable');
  const denied=fixture({authorize:async()=>({ok:false})});
  assert.equal((await denied.request(items.B)).code,403);
  delete process.env.URENAVI_ROOM_COPY_FREE_EVIDENCE;
  const noFree=fixture();
  assert.equal((await noFree.request(items.B)).body.copyReason,'free_evidence_unconfirmed');
  assert.equal(noFree.paths.length,0);
});

test('the app displays and copies only the server-approved post for room-copy results',()=>{
  const fs=require('node:fs');
  const vm=require('node:vm');
  const html=fs.readFileSync(require('node:path').join(__dirname,'../public/app.html'),'utf8');
  const between=(begin,end)=>html.slice(html.indexOf(begin),html.indexOf(end,html.indexOf(begin)));
  const code=between('function aiPhase1Post(', '\nfunction aiPanelMarkup(')+
    between('function resolveAiGate(', '\nfunction mediaTemplateFor(')+
    between('function resolvedPost(', '\nfunction post(')+
    between('function postReady(', '\nfunction postDisplay(');
  const validation={productType:{value:'電気ケトル',valid:true},mode:'simple',reasons:[]};
  const result=new Map();
  const context=vm.createContext({aiGatesFullOutput:true,aiRoomResults:result,
    aiSalesInsight:()=>({productType:'電気ケトル'}),safeSearchIdentity:()=>'',ruleSecondOpinion:()=>({conflict:false}),
    firstImageUrl:()=>'',aiPostState:()=>({target:{callAi:true},state:result.get(0)}),
    window:{UrenaviPurchaseCopyQuality:require('../public/purchase-copy-quality'),
      UrenaviPainCopy:{buildValidatedProductPost:()=>{throw Error('Analysis-only fallback must not run');}}}
  });
  vm.runInContext(code+'\nfunction post(item){return resolvedPost(item,0);}',context);
  for(const data of [{copyStatus:'stopped',validation,sourceCopy:{text:'拒否された本文'}},{copyStatus:'ready',validation}]){
    result.set(0,{state:'done',data});
    assert.equal(context.resolvedPost(items.B,0),'');
    assert.equal(context.postReady(items.B),false);
  }
  result.set(0,{state:'done',data:{copyStatus:'ready',validation,sourceCopy:{text:quote,proof:{kind:'reviewed_groq_copy'}}}});
  assert.equal(context.resolvedPost(items.B,0),quote);
  assert.equal(context.postReady(items.B),true);
  context.ruleSecondOpinion=()=>({conflict:true});
  assert.equal(context.postReady(items.B),false);
});

test('a dictionary miss can use a declared source subject without inventing an identity',async t=>{
  environment(t);
  const name='窓辺ラック';
  const fact='20cmの開口部により、工具の出し入れを簡単にできます。';
  const item={itemCode:'fixture:declared',itemName:name+' 工具収納箱',
    itemCaption:'商品名 窓辺ラック\n【各部の特長】 工具収納箱は、開口部から中の工具を取り出せる設計です。'+fact};
  const raw={productType:{value:name,source:'itemName',evidence:name},
    features:[{text:fact,source:'itemCaption',evidence:fact}],sellingPoints:[],confidence:'high'};
  const f=fixture({prior:null,reply:{...ok,raw}});
  assert.equal((await f.request(item)).body.route.route,'text');
  assert.equal(f.sends,1);
});

function approveTrial(item){
 const digest=createHash('sha256').update(JSON.stringify([item.itemCode,item.itemName,item.itemCaption,item.itemPrice])).digest('hex');
 const evidence=JSON.parse(process.env.URENAVI_ROOM_COPY_FREE_EVIDENCE);
 process.env.VERCEL_GIT_COMMIT_SHA='b'.repeat(40);
 process.env.URENAVI_ROOM_COPY_FREE_EVIDENCE=JSON.stringify({...evidence,trial:{sha:process.env.VERCEL_GIT_COMMIT_SHA,sourceHashes:[digest]}});
}

test('trial requires an exact approved source and SHA; unreviewable prose stays private',async t=>{
 environment(t);
 const f=fixture({prior:null,reply:{...ok,raw:{...confirmed,roomCopy:'根拠があるように見える任意の文章'}}});
 const trial={groqRoomCopyTrial:true};
 assert.equal((await f.request(items.B,trial)).body.copyReason,'groq_trial_approval_unconfirmed');
 approveTrial(items.B);
 assert.equal((await f.request({...items.B,itemPrice:1},trial)).body.copyReason,'groq_trial_approval_unconfirmed');
 assert.equal(f.sends,0);
 const first=await f.request(items.B,trial);
 assert.equal(first.body.copyReason,'provider_candidate_requires_review');
 assert.equal(first.body.sourceCopy,null);
 assert.ok(!JSON.stringify(first.body).includes('任意の文章'));
 assert.equal((await f.request(items.B,trial)).body.copyReason,'provider_candidate_requires_review');
 assert.equal(f.sends,1);
});

test('trial can return the exact independently verified post and does not resend on retrieval',async t=>{
 environment(t);
 approveTrial(items.B);
 const copy='電気ケトル\n精密な注ぎ口のデザインにより、水流の量や速度を初心者でも簡単に調整できます。';
 const f=fixture({prior:null,reply:{...ok,raw:{...confirmed,roomCopy:copy}}});
 for(const route of ['text','cache']){
  const result=await f.request(items.B,{groqRoomCopyTrial:true});
  assert.equal(result.body.copyStatus,'ready');
  assert.equal(result.body.route.route,route);
 }
 assert.equal(f.sends,1);
});

test('trial does not retry after candidate save fails',async t=>{
 environment(t);
 approveTrial(items.B);
 const f=fixture({prior:null,policy:{save:false},reply:{...ok,raw:{...confirmed,roomCopy:'候補'}}});
 assert.equal((await f.request(items.B,{groqRoomCopyTrial:true})).body.copyReason,'provider_result_save_unconfirmed');
 await f.request(items.B,{groqRoomCopyTrial:true});
 assert.equal(f.sends,1);
});

test('trial transport sends facts and editorial copy in the same structured request with zero retries',async()=>{
 const {defaultCallGroq}=require('../lib/room-ai-handler');
 let calls=0;
 await assert.rejects(defaultCallGroq({...items.B,apiKey:mockKey,model:'openai/gpt-oss-120b',roomCopyTrial:true,maxRetries:2,
  fetchImpl:async(_,options)=>{
   calls++;
   const body=JSON.parse(options.body);
   assert.equal(body.max_output_tokens,2000);
   assert.ok(body.text.format.schema.required.includes('roomCopy'));
   assert.ok(body.text.format.schema.required.includes('productType'));
   return new Response('{}',{status:429});
  }
 }),error=>error.status===429);
 assert.equal(calls,1);
});

test('normal generation in a paid-configured environment cannot bypass confirmed budget evidence',async t=>{
 environment(t);
 const snapshot=['URENAVI_GROQ_PLAN','URENAVI_GROQ_PAID_ENABLED','URENAVI_GROQ_PAID_EVIDENCE','URENAVI_GROQ_PAID_ROOM_COPY_ENABLED']
  .map(key=>[key,process.env[key]]);
 t.after(()=>{for(const [key,value] of snapshot){
  if(value===undefined)delete process.env[key];else process.env[key]=value;
 }});
 process.env.VERCEL_ENV='production';
 process.env.URENAVI_GROQ_PLAN='paid';
 delete process.env.URENAVI_GROQ_PAID_ENABLED;
 delete process.env.URENAVI_GROQ_PAID_EVIDENCE;
 delete process.env.URENAVI_GROQ_PAID_ROOM_COPY_ENABLED;
 const f=fixture({prior:null});
 assert.equal((await f.request(items.B)).body.copyReason,'paid_budget_unconfirmed');
 assert.equal((await f.request(items.B,{groqRoomCopyTrial:true})).body.copyReason,'groq_trial_unavailable');
 assert.equal(f.sends,0);
 assert.equal(f.paths.length,0);
});

test('an exact human-reviewed paraphrase can be retrieved without a new send',async t=>{
 environment(t);
 approveTrial(items.B);
 const {reviewDigest}=require('../lib/urenavi-core/room-copy-review');
 const previous=process.env.URENAVI_ROOM_COPY_REVIEWED_HASHES;
 t.after(()=>{if(previous===undefined)delete process.env.URENAVI_ROOM_COPY_REVIEWED_HASHES;
  else process.env.URENAVI_ROOM_COPY_REVIEWED_HASHES=previous;});
 delete process.env.URENAVI_ROOM_COPY_REVIEWED_HASHES;
 const raw={...confirmed,roomCopy:'お湯を注ぐ量や速さを調整したいときに。精密な注ぎ口の電気ケトルです。'};
 const f=fixture({prior:null,reply:{...ok,raw}});
 const action={groqRoomCopyTrial:true};
 assert.equal((await f.request(items.B,action)).body.copyReason,'provider_candidate_requires_review');
 delete process.env.URENAVI_ROOM_COPY_FREE_EVIDENCE;
 process.env.URENAVI_ROOM_COPY_REVIEWED_HASHES=JSON.stringify([reviewDigest(items.B,raw)]);
 const ready=(await f.request(items.B,{...action,reviewOnly:true})).body;
 assert.equal(ready.copyStatus,'ready');
 assert.equal(ready.sourceCopy.proof.kind,'reviewed_groq_copy');
 assert.ok(ready.sourceCopy.text.startsWith(raw.roomCopy));
 assert.equal(ready.route.groqCalls,0);
 assert.equal((await f.request({...items.B,itemPrice:1},action)).body.copyReason,'provider_candidate_requires_review');
 assert.equal(f.sends,1);
});


test('review-only cache miss cannot send even when the fixed source is approved',async t=>{
 environment(t);
 approveTrial(items.B);
 const f=fixture({prior:null});
 const response=await f.request(items.B,{groqRoomCopyTrial:true,reviewOnly:true});
 assert.equal(response.body.copyReason,'reviewed_candidate_not_found');
 assert.equal(f.paths.length,0);
 assert.equal(f.sends,0);
});
