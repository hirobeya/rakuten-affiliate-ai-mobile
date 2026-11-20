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
const approve=(target,opts={})=>signed({approvalId:hash(target),expiresAt:new Date(now+300000).toISOString(),scope,target,...opts},approvalKeys.privateKey);
const approvalEnvelope=approve({itemCode:item.itemCode,arm:'B',stage:'generate'});
const usage={prompt_tokens:1500,completion_tokens:400,total_tokens:1900};
const draft={product:{what:'収納ボックス',acts_on:'食材を分けて収納',acts_on_quote:'食材を分けて収納できます'},
 sentences:[{text:'仕切りの付いた収納ボックスで、食材を分けて収納できます。',
  quotes:['収納ボックス','仕切りが付いています','食材を分けて収納できます'],kinds:['spec','benefit']}]};
const review={product:{what:'supported',acts_on:'supported'},sentences:[{
 text:draft.sentences[0].text,evidenceQuotes:draft.sentences[0].quotes,reason:'literal source',
 target:'supported',part:'supported',conditions:'supported',negation:'supported',degree:'supported'
}],quality:{identity:'supported',reason:'supported',scene:'supported',natural:'supported',non_redundant:'supported',room_style:'supported'}};
const stage=(overrides={})=>{
 const target={itemCode:item.itemCode,arm:'B',stage:'generate'};
 for(const field of Object.keys(target))if(field in overrides)target[field]=overrides[field];
 return {approvalEnvelope:approve(target),...target,...overrides};
};
const provider=(raw=draft)=>({status:200,model:MODEL,providerRequestId:'simulated',raw,usage});

function counters(time){
 const minute=new Date(time+45000).toISOString();
 const day=new Date(time+300000).toISOString();
 return {
  rpm:{limit:30,remaining:10,resetAt:new Date(time+40000).toISOString()},rpd:{limit:1000,remaining:50,resetAt:new Date(time+290000).toISOString()},
  tpm:{limit:8000,remaining:8000,resetAt:minute},tpd:{limit:200000,remaining:40000,resetAt:day}
 };
}
function confirmedWindows(time,tenants){
 const seen=new Date(time).toISOString();
 const result=[];
 const values=counters(time);
 for(const [period,r,t] of [['minute',values.rpm,values.tpm],['day',values.rpd,values.tpd]]){
  result.push([null,period,seen,r.resetAt,seen,r.limit,0,r.limit-r.remaining,0,'requests']);
  result.push([null,period,seen,t.resetAt,seen,0,t.limit,0,t.limit-t.remaining,'tokens']);
  for(const tenant of tenants)result.push([tenant,period,seen,t.resetAt,seen,r.limit,t.limit,0,0,'both']);
 }
 return result;
}
async function fixture(t,{answer,dbResult=()=>true,evidencePatch={},clock=()=>now,failSave=false,authorize=async()=>auth,inputsOverride=inputs,budgetSource='official'}={}){
 const directory=await fs.mkdtemp(path.join(os.tmpdir(),'paired-comparison-'));
 t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const plain=createComparisonJournal(directory);
 const journal={...plain,async create(key,value){
  if(failSave&&key.endsWith('-result'))throw Error('disk unavailable');
  return plain.create(key,value);
 }};
 let observed=0;
 const evidence=patch=>({
  source:budgetSource==='self_ledger'?'administrator_declaration':'groq_console',
  artifactSha256:hash(++observed),model:MODEL,account,plan:'free',billable:false,
  exclusiveWindow:true,unresolvedSends:0,verifiedAt:new Date(now).toISOString(),
  counters:counters(now),
  ...(budgetSource==='self_ledger'?{
   expiresAt:new Date(now+300000).toISOString(),
   exclusiveWindow:false,unresolvedSends:null
  }:{}),...patch
 });
 const rpc=[],calls=[];
 const make=()=>createComparisonRunner({
  environment:'isolated',inputs:inputsOverride,executionSha:sha,account,authorize,now:clock,budgetSource,
  approvalKey:approvalKeys.publicKey,evidenceKey:evidenceKeys.publicKey,journal,
  readEvidence:async()=>signed(evidence(evidencePatch),evidenceKeys.privateKey),
  db:async(route,{body})=>{const args=JSON.parse(body);rpc.push([route,args]);return dbResult(route,args);},
  transport:async body=>{calls.push(body);return answer?answer(body):provider();}
 },index,plan);
 return {runner:make(),make,journal,rpc,calls,evidence};
}
test('missing or altered approval and unknown capacity never reserve or send',async t=>{
 const f=await fixture(t,{evidencePatch:{counters:{}}});
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

for(const [name,options,reason] of [
 ['stale evidence',{evidencePatch:{verifiedAt:new Date(now-60001).toISOString()}},'official_capacity_unverified_or_insufficient'],
 ['wrong account',{evidencePatch:{account:{...account,project:'other'}}},'official_capacity_unverified_or_insufficient'],
 ['wrong model',{evidencePatch:{model:'other'}},'official_capacity_unverified_or_insufficient'],
 ['unresolved provider send',{evidencePatch:{unresolvedSends:1}},'official_capacity_unverified_or_insufficient'],
 ['unverified billing',{evidencePatch:{billable:null}},'official_capacity_unverified_or_insufficient'],
 ['unconfirmed free plan',{evidencePatch:{plan:null}},'official_capacity_unverified_or_insufficient'],
 ['normal user',{authorize:async()=>({...auth,plan:'pro'})},'owner_required'],
 ['other owner',{authorize:async()=>({...auth,user:{...auth.user,id:'22222222-2222-4222-8222-222222222222'}})},'approval_invalid_or_expired'],
 ['missing DB',{dbResult:()=>{throw Error('DB unavailable');}},'reservation_not_confirmed'],
 ['reservation denied',{dbResult:()=>false},'reservation_not_confirmed']
]){
 test(name+' never invokes the transport',async t=>{
  const f=await fixture(t,options);
  assert.equal((await f.runner.run(stage())).reason,reason);
  assert.equal(f.calls.length,0);
 });
}
test('signed approval only permits its one stage and tampered source cannot build a runner',async t=>{
 const f=await fixture(t);
 assert.equal((await f.runner.run(stage({arm:'C',approvalEnvelope}))).reason,'stage_not_approved');
 assert.equal(f.calls.length,0);
 await assert.rejects(fixture(t,{inputsOverride:[{...inputs[0],item:{...item,itemPrice:999}}]}),/input|hash|source/);
});
test('unresolved intent, missing recovery evidence and failed settlement block additional sends',async t=>{
 const f=await fixture(t,{dbResult:r=>!r.includes('complete')});
 const id=scope.slots[0].attemptIds.writer;
 assert.equal((await f.runner.run(stage())).reason,'settlement_unconfirmed');
 assert.equal((await f.make().recover({recoveryEnvelope:null})).reason,'recovery_evidence_invalid');
 assert.equal((await f.make().run(stage({arm:'C'}))).reason,'study_halted');
 assert.equal(f.calls.length,1);
 const g=await fixture(t);
 await g.journal.create(id+'-claim',{});
 assert.equal((await g.make().run(stage({arm:'C'}))).reason,'unresolved_prior_claim');
 assert.equal(g.calls.length,0);
});

test('expiry during reservation or durable intent never reaches the transport',async t=>{
 for(const [rpc,delay,reason] of [
  ['reserve_v2',60001,'evidence_or_approval_expired_before_intent'],
  ['comparison_intent_v2',30000,'evidence_or_approval_expired_before_transport']
 ]){
  let elapsed=0;
  const f=await fixture(t,{clock:()=>now+elapsed,dbResult:route=>{
   if(route.endsWith('capacity_'+rpc))elapsed=delay;
   return true;
  }});
  assert.equal((await f.runner.run(stage())).reason,reason);
  assert.equal(f.calls.length,0);
 }
});
test('a signed scope change or partial provider proof never grants transport',async t=>{
 const f=await fixture(t,{evidencePatch:{source:'groq_headers'}});
 const request=stage();
 const wrong=approve(request.approvalEnvelope.payload.target,{scope:{...scope,maxCalls:9}});
 assert.equal((await f.runner.run({...request,approvalEnvelope:wrong})).reason,'approval_invalid_or_expired');
 assert.equal((await f.runner.run(request)).reason,'official_capacity_unverified_or_insufficient');
 assert.equal(f.calls.length,0);
});

if(process.env.URENAVI_DISPOSABLE_PG==='1'){
 test('isolated PostgreSQL: owner, durable intent, settlement, restart, halt and recovery',async t=>{
  const {execFileSync}=require('node:child_process');
  const psql=sql=>execFileSync('psql',['-XAt','-v','ON_ERROR_STOP=1'],{
   input:sql,encoding:'utf8',env:{PATH:process.env.PATH,PGHOST:'127.0.0.1',PGPORT:'5432',
    PGUSER:'postgres',PGPASSWORD:'postgres',PGDATABASE:'urenavi_paired_test',PGCONNECT_TIMEOUT:'3'}
  }).trim().split('\n').at(-1);
  const sqlArgument=value=>value===null?'null':"'"+String(value).replaceAll("'","''")+"'";
  const db=async(route,options)=>{
   assert.match(route,/^rpc\/urenavi_capacity_(reserve|comparison_intent|complete|comparison_resume)_v2$/);
   const args=Object.entries(JSON.parse(options.body)).map(([name,value])=>{
    assert.match(name,/^p_[a-z_]+$/);
    if(value===null)return name+'=>null';
    if(name==='p_counters')return name+'=>'+sqlArgument(JSON.stringify(value));
    assert.match(String(value),/^[a-zA-Z0-9_.:\-]+$/);
    return name+"=>'"+value+"'";
   });
   return psql('set role service_role; select public.'+route.slice(4)+'('+args.join(',')+');')==='t';
  };
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'paired-postgres-'));
  t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const journal=createComparisonJournal(dir);
  let captureTime,seq=0,sendCount=0;
  const evidence=(extra={})=>({
   source:'groq_console',artifactSha256:hash(['integration',++seq]),account,model:MODEL,plan:'free',
   billable:false,exclusiveWindow:true,unresolvedSends:0,verifiedAt:new Date(captureTime).toISOString(),
   counters:counters(captureTime),...extra
  });
  function confirmWindows(){
   captureTime=Date.now();
   for(const row of confirmedWindows(captureTime,[auth.user.id,'22222222-2222-4222-8222-222222222222'])){
    assert.equal(psql("set role service_role; select public.urenavi_capacity_confirm_window_v2('groq',"+
     row.map(sqlArgument).join(',')+');'),'t');
   }
  }
  const writerId=scope.slots[0].attemptIds.writer;
  const otherId=scope.slots[1].attemptIds.writer;
  const attempt=id=>psql(`select outcome from public.urenavi_capacity_attempt_v2 where id='${id}';`);
  const make=(authorize=async()=>auth)=>createComparisonRunner({
   environment:'isolated',inputs,executionSha:sha,account,authorize,db,journal:createComparisonJournal(dir),
   approvalKey:approvalKeys.publicKey,evidenceKey:evidenceKeys.publicKey,
   readEvidence:async()=>signed(evidence(),evidenceKeys.privateKey),
   transport:async()=>{
    const id=sendCount++===0?writerId:otherId;
    assert.equal(attempt(id),'sent');
    assert.equal(psql(`select count(*) from public.urenavi_capacity_comparison_evidence_v2 where attempt_id='${id}';`),'1');
    return id===writerId?provider():{status:429};
   }
  },index,plan);
  const request=(arm='B')=>stage({arm,approvalEnvelope:approve({itemCode:item.itemCode,arm,stage:'generate'},
   {expiresAt:new Date(Date.now()+60000).toISOString()})});
  psql("insert into public.urenavi_capacity_provider_v2(provider) values('groq');");
  confirmWindows();
  assert.equal(psql("select has_table_privilege('authenticated','public.urenavi_capacity_attempt_v2','SELECT');"),'f');
  assert.equal(psql("select has_function_privilege('authenticated','public.urenavi_capacity_reserve_v2(uuid,text,uuid,bigint)','EXECUTE');"),'f');
  assert.equal((await make(async()=>({...auth,plan:'pro'})).run(request())).reason,'owner_required');
  assert.equal((await make(async()=>({...auth,user:{...auth.user,id:'22222222-2222-4222-8222-222222222222'}})).run(request())).reason,'approval_invalid_or_expired');
  assert.equal(sendCount,0);
  assert.equal((await make().run(request())).status,'completed');
  assert.equal(attempt(writerId),'spent');
  const stored=execFileSync(process.execPath,['-e',`
   const j=require('./lib/urenavi-core/comparison-journal').createComparisonJournal(process.argv[1]);
   j.read(process.argv[2]+'-result').then(record=>process.stdout.write(String(record.usage.total)));
  `,dir,writerId],{encoding:'utf8'});
  assert.equal(stored,'1900');
  assert.equal((await make().run(request())).reason,'duplicate_attempt');
  assert.equal((await make().run(request('C'))).reason,'provider_rate_limited');
  assert.equal(attempt(otherId),'rate_limited');
  assert.equal((await make().run(request())).reason,'study_halted');
  assert.equal(sendCount,2);
  const recover=()=>make().recover({recoveryEnvelope:signed(evidence({
   executionSha:sha,tenant:auth.user.id,studyId:plan.studyId,reconciled:true,attemptIds:[otherId]
  }),evidenceKeys.privateKey)});
  assert.equal((await recover()).reason,'recovery_not_confirmed');
  // Advance only the disposable fixture's windows to simulate elapsed provider windows.
  psql("update public.urenavi_capacity_window_v2 set ends_at=clock_timestamp()-interval '1 millisecond';");
  confirmWindows();
  assert.equal((await recover()).status,'recovered');
  assert.equal((await journal.read(otherId+'-recovered')).evidenceHash.length,64);
  assert.equal((await make().run(request('C'))).reason,'duplicate_attempt');
  assert.equal(sendCount,2);
 });
}

if(process.env.URENAVI_TEST_SUPABASE_DIR){
 test('local Supabase Auth and PostgREST survive restart and fail closed',async t=>{
  const {execFileSync}=require('node:child_process');
  const {randomUUID}=require('node:crypto');
  const {createIsolatedComparisonSupabase}=require('../../scripts/rebuild/isolated-comparison-supabase.cjs');
  const {importOfficialEvidence,matchesOfficialArtifact}=require('../../lib/urenavi-core/official-capacity-evidence');
  const directory=process.env.URENAVI_TEST_SUPABASE_DIR;
  const status=JSON.parse(await fs.readFile(path.join(directory,'status.json'),'utf8'));
  const api=assertLocal(status.API_URL,'http:',54321).origin;
  const loopbackFetch=globalThis.fetch;
  t.mock.method(globalThis,'fetch',(url,options)=>{
   assert.equal(new URL(url).origin,api,'this test permits only local Supabase HTTP');
   return loopbackFetch(url,options);
  });
  const postgres=assertLocal(status.DB_URL,'postgresql:',54322);
  assert.equal(postgres.pathname,'/postgres');
  const serviceKey=status.SERVICE_ROLE_KEY;
  const anonKey=status.ANON_KEY;
  assert.ok(serviceKey&&anonKey);
  function assertLocal(value,protocol,port){
   const url=new URL(value);
   assert.equal(url.protocol,protocol);
   assert.equal(url.hostname,'127.0.0.1');
   assert.equal(Number(url.port),port);
   return url;
  }
  function sql(statement,args=[]){
   return execFileSync('psql',['-XAtq','-v','ON_ERROR_STOP=1',...args],{
    input:statement,encoding:'utf8',env:{PATH:process.env.PATH,PGHOST:postgres.hostname,PGPORT:postgres.port,
     PGUSER:decodeURIComponent(postgres.username),PGPASSWORD:decodeURIComponent(postgres.password),
     PGDATABASE:'postgres',PGCONNECT_TIMEOUT:'3'}
   }).trim();
  }
  async function authRequest(route,key,body){
   const response=await fetch(api+'/auth/v1/'+route,{method:'POST',redirect:'error',signal:AbortSignal.timeout(4000),
    headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify(body)});
   assert.ok(response.ok,'local Auth '+route+' returned '+response.status);
   return response.json();
  }
  async function createUser(owner){
   const credentials={email:randomUUID()+'@example.com',password:randomUUID()};
   const created=await authRequest('admin/users',serviceKey,{...credentials,email_confirm:true,
    app_metadata:owner?{urenavi_role:'owner'}:{},user_metadata:{urenavi_role:'owner'}});
   const session=await authRequest('token?grant_type=password',anonKey,credentials);
   assert.equal(session.user.id,created.id);
   assert.match(created.id,/^[0-9a-f-]{36}$/);
   return {id:created.id,jwt:session.access_token};
  }
  sql('', ['-f','docs/architecture/multitenant-capacity-v2.sql','-f','docs/architecture/comparison-capacity-v2.sql',
   '-f','docs/architecture/isolated-comparison-journal-v2.sql']);
  sql("notify pgrst, 'reload schema';");
  const [owner,member,other]=await Promise.all([createUser(true),createUser(false),createUser(true)]);
  const clientFor=user=>createIsolatedComparisonSupabase({url:api,serviceKey,ownerJwt:user.jwt});
  assert.equal((await clientFor(owner).authorize()).user.id,owner.id);
  assert.equal((await clientFor(member).authorize()).ok,false);
  assert.equal((await clientFor(other).authorize()).user.id,other.id);
  const rpc=(action,body)=>clientFor(owner).db('rpc/urenavi_capacity_'+action+'_v2',
   {method:'POST',body:JSON.stringify(body)});
  const blocked=await fetch(api+'/rest/v1/rpc/urenavi_capacity_reserve_v2',{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(4000),
   headers:{apikey:anonKey,Authorization:'Bearer '+member.jwt,'Content-Type':'application/json'},
   body:JSON.stringify({p_id:randomUUID(),p_provider:'groq',p_tenant:owner.id,p_estimate:1})
  });
  assert.ok([401,403,404].includes(blocked.status),'authenticated reservation access must be denied');
  const executionSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const signedScope=expectedApproval(executionSha,owner.id,account,plan);
  const request=arm=>{
   const target={itemCode:item.itemCode,arm,stage:'generate'};
   return {...target,approvalEnvelope:approve(target,{scope:signedScope,expiresAt:new Date(Date.now()+60000).toISOString()})};
  };
  let captureTime,simulated=0;
  const writerId=signedScope.slots.find(s=>s.arm==='B').attemptIds.writer;
  const row=()=>sql(`select outcome || ':' || coalesce(actual_tokens::text,'?')
   from public.urenavi_capacity_attempt_v2 where id='${writerId}' and tenant='${owner.id}';`);
  async function loadWindows(){
   sql("truncate public.urenavi_capacity_comparison_evidence_v2, public.urenavi_capacity_attempt_v2, public.urenavi_capacity_window_v2, public.urenavi_capacity_provider_v2; insert into public.urenavi_capacity_provider_v2(provider) values ('groq');");
   captureTime=Date.now();
   const names=['tenant','period','start','end','verified','request_limit','token_limit','external_requests','external_tokens','dimension'];
   for(const row of confirmedWindows(captureTime,[owner.id,other.id])){
    const args=Object.fromEntries(names.map((name,index)=>['p_'+name,row[index]]));
    assert.equal(await rpc('confirm_window',{p_provider:'groq',...args}),true);
   }
  }
  function runner(user,journal,reply=provider){
   const artifact=Buffer.from('synthetic Supabase test '+journal);
   return createComparisonRunner({environment:'isolated',inputs,executionSha,account,...clientFor(user),
    journal:typeof journal==='string'?createComparisonJournal(journal):journal,
    approvalKey:approvalKeys.publicKey,evidenceKey:evidenceKeys.publicKey,
    readEvidence:async()=>{
     const evidence=importOfficialEvidence({source:'groq_console',account,model:MODEL,verifiedAt:new Date(captureTime).toISOString(),
      plan:'free',billable:false,exclusiveWindow:true,unresolvedSends:0,counters:counters(captureTime)},artifact);
     assert.ok(matchesOfficialArtifact(evidence,artifact));
     return signed(evidence,evidenceKeys.privateKey);
    },transport:async()=>{
     simulated++;
     assert.equal(row(),'sent:?');
     assert.equal(sql(`select count(*) from public.urenavi_capacity_comparison_evidence_v2 where attempt_id='${writerId}';`),'1');
     return reply();
    }
   },index,plan);
  }
  const durable=await fs.mkdtemp(path.join(directory,'journals','successful-'));
  await loadWindows();
  assert.equal((await runner(member,durable).run(request('B'))).reason,'owner_required');
  assert.equal((await runner(other,durable).run(request('B'))).reason,'approval_invalid_or_expired');
  assert.equal(simulated,0);
  assert.equal((await runner(owner,durable).run(request('B'))).status,'completed');
  assert.equal(row(),'spent:1900');
  const {createDurableComparisonJournal}=require('../../lib/urenavi-core/comparison-journal');
  const journalBeforeRestart=createDurableComparisonJournal(clientFor(owner).db);
  await journalBeforeRestart.create('restart-evidence',{saved:true,word:'日本語'});
  const supabase=(action,args=[])=>execFileSync('supabase',[action,'--workdir',directory,...args],{stdio:'ignore'});
  supabase('stop');
  const unavailable=await fs.mkdtemp(path.join(directory,'journals','stopped-'));
  assert.equal((await runner(owner,unavailable).run(request('B'))).status,'stopped');
  assert.equal(simulated,1);
  supabase('start',['-x',process.env.URENAVI_TEST_SUPABASE_EXCLUDE]);
  assert.equal((await clientFor(owner).authorize()).user.id,owner.id);
  assert.equal(row(),'spent:1900');
  assert.equal(execFileSync(process.execPath,['-e',`
   const j=require('./lib/urenavi-core/comparison-journal').createComparisonJournal(process.argv[1]);
   j.read(process.argv[2]+'-result').then(record=>process.stdout.write(String(record.usage.total)));
  `,durable,writerId],{encoding:'utf8'}),'1900');
  assert.equal((await runner(owner,durable).run(request('B'))).reason,'duplicate_attempt');
  assert.equal(simulated,1);
  for(const [label,reply,reason,outcome] of [
   ['rate-limit',()=>({status:429}),'provider_rate_limited','rate_limited:?'],
   ['timeout',()=>{throw Error('simulated transport timeout');},'transport_or_persistence_failure','unknown:?'],
   ['unwritable-result',provider,'transport_or_persistence_failure','unknown:?'],
   ['overrun',()=>({...provider(),usage:{prompt_tokens:8600,completion_tokens:400,total_tokens:9000}}),
    'reservation_or_output_overrun','spent:9000']
  ]){
   await loadWindows();
   const journal=await fs.mkdtemp(path.join(directory,'journals',label+'-'));
   if(label==='unwritable-result')await fs.mkdir(path.join(journal,writerId+'-result.json'));
   const before=simulated;
   assert.equal((await runner(owner,journal,reply).run(request('B'))).reason,reason);
   assert.equal(row(),outcome);
   assert.equal((await runner(owner,journal,reply).run(request('C'))).reason,'study_halted');
   assert.equal(simulated,before+1);
  }
  // The real PostgREST path uses one DB journal across worker restarts.
  // No Groq transport: the pre-existing provider fixture is an in-process mock.
  await loadWindows();
  const remoteJournal=createDurableComparisonJournal(clientFor(owner).db);
  const before=simulated;
  assert.equal((await runner(owner,remoteJournal).run(request('B'))).status,'completed');
  assert.equal(simulated,before+1);
  assert.equal((await remoteJournal.read(writerId+'-result')).usage.total,1900);
  const recoveredJournal=createDurableComparisonJournal(clientFor(owner).db);
  assert.equal((await recoveredJournal.read(writerId+'-result')).usage.total,1900);
  assert.equal((await runner(owner,recoveredJournal).run(request('B'))).reason,'duplicate_attempt');
  assert.equal(simulated,before+1);
 });
}

test('signed self-ledger mode reuses durable stage workflow but never assumes provider balances',async t=>{
 const f=await fixture(t,{budgetSource:'self_ledger',evidencePatch:{counters:{}}});
 const target={itemCode:item.itemCode,arm:'B',stage:'generate'};
 const approvalEnvelope=signed({approvalId:hash(['self',target]),
  expiresAt:new Date(now+300000).toISOString(),
  scope:expectedApproval(sha,auth.user.id,account,plan,'self_ledger'),target},approvalKeys.privateKey);
 assert.equal((await f.runner.run(stage())).reason,'approval_invalid_or_expired');
 assert.equal(f.calls.length,0,'ordinary official approval never opts into self policy');
 const reply=await f.runner.run({...target,approvalEnvelope});
 assert.equal(reply.status,'completed');
 assert.equal(f.calls.length,1);
 assert.deepEqual(f.rpc.map(x=>x[0]),[
  'rpc/urenavi_self_budget_reserve_v2',
  'rpc/urenavi_self_budget_intent_v2',
  'rpc/urenavi_self_budget_complete_v2'
 ]);
 assert.equal(f.rpc[0][1].p_tenant,auth.user.id);
 assert.equal(f.rpc[2][1].p_actual,1900);
 assert.equal((await f.runner.recover({recoveryEnvelope:null})).reason,'manual_reconciliation_required');
});
test('self-ledger requires signed verified Free evidence and never sends on unknown billing',async t=>{
 for(const patch of [{billable:null},{plan:null},
  {expiresAt:new Date(now-1).toISOString()},
  {expiresAt:new Date(now+86400001).toISOString()},
  {verifiedAt:new Date(now+1000).toISOString()}]){
  const f=await fixture(t,{budgetSource:'self_ledger',evidencePatch:{counters:{},...patch}});
  const target={itemCode:item.itemCode,arm:'B',stage:'generate'};
  const approvalEnvelope=signed({approvalId:hash(['self',target]),
   expiresAt:new Date(now+300000).toISOString(),
   scope:expectedApproval(sha,auth.user.id,account,plan,'self_ledger'),target},approvalKeys.privateKey);
  assert.equal((await f.runner.run({...target,approvalEnvelope})).reason,'official_capacity_unverified_or_insufficient');
  assert.equal(f.calls.length,0);
  assert.equal(f.rpc.length,0);
 }
});

test('approved self-ledger batch permits exactly its signed stage targets with one reusable declaration',async t=>{
 const f=await fixture(t,{budgetSource:'self_ledger',evidencePatch:{counters:{}}});
 const targets=[{itemCode:item.itemCode,arm:'B',stage:'generate'},
  {itemCode:item.itemCode,arm:'C',stage:'generate'}];
 const approvalEnvelope=signed({
  approvalId:hash(['batch',targets]),expiresAt:new Date(now+300000).toISOString(),
  scope:expectedApproval(sha,auth.user.id,account,plan,'self_ledger'),targets,maxCalls:2
 },approvalKeys.privateKey);
 const first=await f.runner.run({...targets[0],approvalEnvelope});
 assert.equal(first.status,'completed');
 const second=await f.runner.run({...targets[1],approvalEnvelope});
 assert.equal(second.status,'completed');
 assert.equal(f.calls.length,2);
 assert.equal(f.rpc.filter(([name])=>name.endsWith('_intent_v2')).length,2);
 assert.equal((await f.runner.run({...targets[0],approvalEnvelope})).reason,'batch_call_limit_reached');
 assert.equal(f.calls.length,2);
});
test('self-ledger signed batch never broadens stage, authorization scope or maximum calls',async t=>{
 const f=await fixture(t,{budgetSource:'self_ledger',evidencePatch:{counters:{}}});
 const allowed={itemCode:item.itemCode,arm:'B',stage:'generate'};
 const other={itemCode:item.itemCode,arm:'C',stage:'generate'};
 const scope=expectedApproval(sha,auth.user.id,account,plan,'self_ledger');
 const envelope=(targets,maxCalls,expiresAt=new Date(now+300000).toISOString())=>
  signed({approvalId:hash([targets,maxCalls,expiresAt]),scope,targets,maxCalls,expiresAt},
   approvalKeys.privateKey);
 for(const [targets,maxCalls,request,reason] of [
  [[allowed,allowed],2,allowed,'batch_targets_invalid'],
  [[allowed,other],5,allowed,'batch_call_limit_invalid'],
  [[allowed],1,other,'stage_not_approved'],
  [[{...allowed,stage:'verify'}],1,allowed,'batch_targets_invalid'],
  [[{...allowed,unexpected:true}],1,allowed,'batch_targets_invalid'],
 ]){
  const approvalEnvelope=envelope(targets,maxCalls);
  assert.equal((await f.runner.run({...request,approvalEnvelope})).reason,reason);
 }
 assert.equal(f.calls.length,0);assert.equal(f.rpc.length,0);
});
test('self-ledger declaration can be older than 60s but not outlive approval',async t=>{
 const eligible=await fixture(t,{budgetSource:'self_ledger',evidencePatch:{
  verifiedAt:new Date(now-3600000).toISOString(),
  expiresAt:new Date(now+300000).toISOString(),exclusiveWindow:false,unresolvedSends:null
 }});
 const target={itemCode:item.itemCode,arm:'B',stage:'generate'};
 const approvalEnvelope=signed({approvalId:hash(['long-lived',target]),
  expiresAt:new Date(now+300000).toISOString(),
  scope:expectedApproval(sha,auth.user.id,account,plan,'self_ledger'),target
 },approvalKeys.privateKey);
 assert.equal((await eligible.runner.run({...target,approvalEnvelope})).status,'completed');
 const blocked=await fixture(t,{budgetSource:'self_ledger',evidencePatch:{
  expiresAt:new Date(now+600000).toISOString()
 }});
 assert.equal((await blocked.runner.run({...target,approvalEnvelope})).reason,
  'declaration_exceeds_approval_lifetime');
 assert.equal(blocked.calls.length,0);
});

test('administrator declaration imports with a real source hash and cannot impersonate official quota evidence',()=>{
 const {importOfficialEvidence,matchesOfficialArtifact,officialWindows,selfLedgerWindows}
  =require('../../lib/urenavi-core/official-capacity-evidence');
 const artifact=Buffer.from('isolated administrator declared nonbillable Free');
 const observation={source:'administrator_declaration',
  account,model:MODEL,plan:'free',billable:false,exclusiveWindow:false,unresolvedSends:null,
  verifiedAt:new Date(now-3600000).toISOString(),
  expiresAt:new Date(now+300000).toISOString(),counters:{}};
 const imported=importOfficialEvidence(observation,artifact);
 assert.equal(matchesOfficialArtifact(imported,artifact),true);
 assert.ok(selfLedgerWindows(imported,account,now));
 assert.equal(officialWindows(imported,account,now,1000,10000),null);
 assert.equal(selfLedgerWindows({...imported,expiresAt:new Date(now+86400001).toISOString()},account,now),null);
 // The envelope signature, not the artifact hash, authenticates expiry claims.
});
