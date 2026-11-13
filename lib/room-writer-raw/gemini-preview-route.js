'use strict';
// Preview-only, owner-only comparison of four already committed public-source captures.
// No production app route references this endpoint; never uses user-supplied product text.
const {authorize}=require('../billing');
const {prepare}=require('./source');
const verifier=require('./verify');
const {create:createStore,createIndependent}=require('./gemini-attempt-store');
const {MODEL, compareOnce, buildGeminiComparison}=require('./gemini-comparison');
// Static imports so Vercel's serverless file tracing bundles these four samples.
const ITEMS=Object.freeze({
  '3': require('../../docs/experiments/raw-source-fallback-20261111/acquisition-20261111/fresh-products/03.json').source,
  '4': require('../../docs/experiments/raw-source-fallback-20261111/acquisition-20261111/fresh-products/04.json').source,
  '5': require('../../docs/experiments/raw-source-fallback-20261111/acquisition-20261111/fresh-products/05.json').source,
  '6': require('../../docs/experiments/raw-source-fallback-20261111/acquisition-20261111/fresh-products/06.json').source
});
const EXPECTED_BRANCH='experiment/urenavi-gemini-comparison-20261113';
function reply(res,status,data){
  res.status(status).json(data);
}
function authorizedOrigin(req){
  const origin=String(req.headers?.origin||'');
  const host=String(req.headers?.host||'');
  if(!origin||!host)return false;
  try {return new URL(origin).origin==='https://'+host;}catch{return false;}
}
function loadItem(id){
  return Object.hasOwn(ITEMS,String(id)) ? ITEMS[String(id)] : null;
}
function flatten(draft){
  if(draft?.hold?.active || !draft?.post)return null;
  const sections=['sentences','notes','tags'].map(k=>(draft.post[k]||[]).map(x=>x.text).join(k==='tags'?' ':''));
  return [sections[0],sections[1],sections[2]].filter(Boolean).join('\n');
}
function citationsPresent(draft,item){
  if(!draft||!item)return false;
  const blocks=[...(draft.product?.basis||[]),
    ...(draft.post?.sentences||[]).flatMap(x=>x.basis||[]),
    ...(draft.post?.notes||[]).flatMap(x=>x.basis||[]),
    ...(draft.post?.tags||[]).flatMap(x=>x.basis||[])];
  return blocks.length>0 && blocks.every(e=>['itemName','itemCaption','catchcopy'].includes(e.field)
    && typeof e.quote==='string' && e.quote.length>0 && item[e.field].includes(e.quote));
}
// Bounds sum to 57s, leaving 3s beneath the branch's 60s Function limit.
const BUDGET={authorization:8000,storage_state:7000,claim:7000,provider:25000,validation:1000,result_save:7000,overhead:2000};
const {decision:historyDecision}=require('./gemini-history');
const {sdk}=require('./gemini-blob');
const {probe,probeId}=require('./gemini-storage-probe');
const {template:nextExecution,assess:assessGrant}=require('./gemini-execution-grant');
const preparationPolicy=require('../../docs/experiments/gemini-comparison-20261113/preparation-policy.json');
const readiness=require('../../docs/experiments/gemini-comparison-20261113/readiness.json');
function createHandler({authorizeImpl=authorize,compare=compareOnce,storeFactory=(req,grant,scope)=>grant?createIndependent(sdk({oidcToken:req.headers?.['x-vercel-oidc-token']}),grant,scope):createStore(sdk({oidcToken:req.headers?.['x-vercel-oidc-token']})),decide=historyDecision,probeImpl=(options,req)=>probe({...options,blob:sdk({oidcToken:req.headers?.['x-vercel-oidc-token']})}),account=readiness,nextGrant=nextExecution,clock=Date.now}={}){
 return async function handler(req,res){
  const start=clock(),timings=[];let stage='request';
  res.setHeader('Cache-Control','private, no-store, max-age=0');res.setHeader('X-Content-Type-Options','nosniff');
  const respond=(status,data)=>reply(res,status,{...data,stage,executionSha:process.env.VERCEL_GIT_COMMIT_SHA||null,timings});
  async function step(name,ms,fn){stage=name;const at=clock();let timer;
   try{return await Promise.race([Promise.resolve().then(fn),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('gemini_stage_timeout')),ms);})]);}
   finally{clearTimeout(timer);timings.push({stage:name,ms:Math.max(0,clock()-at)});}
  }
  if(process.env.VERCEL_ENV!=='preview'||process.env.VERCEL_GIT_COMMIT_REF!==EXPECTED_BRANCH)return respond(404,{error:'comparison_unavailable'});
  if(!['GET','POST'].includes(req.method))return respond(405,{error:'method_not_allowed'});
  if(req.method==='POST'&&!authorizedOrigin(req))return respond(403,{error:'origin_rejected'});
  let access;try{access=await step('authorization',BUDGET.authorization,()=>authorizeImpl(req));}catch{return respond(503,{error:'authorization_unavailable'});}
  if(!access?.ok||access.plan!=='owner')return respond(403,{error:'owner_only'});
  const id=String(req.method==='GET'?req.query?.id:req.body?.id||'');const item=loadItem(id);
  if(!item)return respond(400,{error:'unknown_fixed_item'});
  const prepared=buildGeminiComparison(item),scope={itemCode:item.itemCode,model:MODEL,requestHash:prepared.requestHash};
  const supplied=req.method==='GET'?req.query:req.body;
  const independent=!!(supplied?.approvalId||supplied?.executionId);
  const next=assessGrant(nextGrant,scope,clock());
  if(independent&&(!next.allow||supplied.approvalId!==nextGrant.approvalId||supplied.executionId!==nextGrant.executionId))return respond(409,{error:'new_explicit_approval_required',nextExecution:next,tokens:null});
  const meta={id,name:item.itemName,...scope,held:prepared.held,sourceHash:prepared.sourceHash,budget:BUDGET,
   approvalId:independent?nextGrant.approvalId:null,executionId:independent?nextGrant.executionId:null,nextExecution:next};
  let store;try{store=storeFactory(req,independent?nextGrant:null,scope);}catch{return respond(503,{...meta,error:'storage_unavailable',tokens:null});}
  if(req.method==='POST'&&req.body?.operation==='storage-probe'){
   if(Object.keys(req.body).some(k=>!['id','operation'].includes(k)))return respond(400,{error:'unexpected_request_fields'});
   try{const proof=await step('storage_probe',45000,()=>probeImpl({sha:process.env.VERCEL_GIT_COMMIT_SHA,context:'runtime'},req));return respond(200,{...meta,storageProof:proof,providerCalls:0});}
   catch(error){return respond(503,{...meta,error:'storage_probe_failed_or_unavailable',storageDiagnostic:{reason:/^gemini_[a-z_]+$/.test(error.message||'')?error.message:'storage_probe_failed',operation:error.storageOperation||null,errorName:error.storageErrorName||null,runtimeOidcAvailable:typeof req.headers?.['x-vercel-oidc-token']==='string'},providerCalls:0});}
  }
  let ledger,storageProof,acceptedStorageProof;
  try{({ledger,storageProof,acceptedStorageProof}=await step('storage_state',BUDGET.storage_state,async()=>{const [ledger,storageProof,acceptedStorageProof]=await Promise.all([store.state(scope),store.readProbe(probeId(process.env.VERCEL_GIT_COMMIT_SHA,'runtime')),store.readProbe(preparationPolicy.acceptedStorageProofSha)]);return {ledger,storageProof,acceptedStorageProof};}));}
  catch{return respond(503,{...meta,error:'storage_state_unavailable',history:decide(scope,null),tokens:null});}
  const history=independent?{allow:!ledger.approvalClaim&&!ledger.claim&&!ledger.result,reason:(ledger.approvalClaim||ledger.claim||ledger.result)?'existing_independent_attempt_do_not_resend':null,priorClassification:'D'}:decide(scope,ledger),runtimeReady=storageProof?.passed===true&&storageProof.version===2&&storageProof.context==='runtime'&&storageProof.executionSha===process.env.VERCEL_GIT_COMMIT_SHA;
  const quota=account.currentQuotaEvidence;
  const accountReady=account.project==='Default Gemini Project'&&account.tier==='free'&&account.model===MODEL&&quota?.verified===true&&quota.projectId===account.projectId&&quota.model===MODEL&&quota.tier==='free'&&['rpm','tpm','rpd'].every(k=>Number.isFinite(quota.limits?.[k])&&quota.limits[k]>0)&&Number.isFinite(quota.observedAtMs)&&quota.observedAtMs<=clock()&&Number.isFinite(quota.validUntilMs)&&clock()<quota.validUntilMs;
  const holds=[...(prepared.held?['source_held']:[]),...(!history.allow?[history.reason]:[]),...(history.allow&&!runtimeReady?['runtime_storage_proof_missing']:[]),...(history.allow&&!accountReady?['current_free_project_limits_evidence_missing']:[])];
  const candidate=ledger.result||((ledger.legacy?.result?.requestHash===scope.requestHash)?ledger.legacy.result:null);
  const validReceipt=!!candidate&&candidate.itemCode===scope.itemCode&&candidate.requestHash===scope.requestHash&&(candidate.model===scope.model||candidate.result?.model===scope.model);
  const saved=validReceipt?candidate:null;
  const recovery={status:!candidate?'no_saved_result':validReceipt?'recovered':'saved_result_scope_unverified',itemCode:scope.itemCode,model:scope.model,requestHash:scope.requestHash,providerCalls:0,historyClassification:validReceipt?'saved_response_requires_review':'D',conclusion:!candidate?'過去の個別Gemini送信・応答・消費は回収不能。D判定を維持。元の承認枠の再送は禁止。':null};
  if(req.method==='GET')return respond(200,{...meta,mode:'offline',executionHold:holds[0]||null,holds,history,storageReady:runtimeReady,storageProof,acceptedStorageProof,accountReady,receipt:saved,recovery,attempt:{claim:!!ledger.claim,dispatch:!!ledger.dispatch,approvalClaim:!!ledger.approvalClaim,legacyClaim:!!ledger.legacy?.claim}});
  if(id!=='3')return respond(403,{error:'only_storage_bench_authorized'});
  if(Object.keys(req.body||{}).some(k=>!(independent?['id','confirm','approvalId','executionId']:['id','confirm']).includes(k)))return respond(400,{error:'unexpected_request_fields'});
  if(req.body?.confirm!=='single-free-tier-call')return respond(412,{error:'explicit_single_call_confirmation_required'});
  if(holds.length)return respond(409,{...meta,error:holds[0],holds,history,tokens:null});
  if(!process.env.GEMINI_API_KEY)return respond(503,{error:'gemini_key_missing'});
  if(clock()-start>15000)return respond(409,{error:'insufficient_dispatch_time_budget',tokens:null});
  const record={...scope,...(independent?{approvalId:nextGrant.approvalId,executionId:nextGrant.executionId}:{}),sourceHash:prepared.sourceHash,executionSha:process.env.VERCEL_GIT_COMMIT_SHA,at:new Date().toISOString(),tokens:null};
  try{await step('claim',BUDGET.claim,async()=>{await store.begin(record);await store.dispatch(scope,{...record,state:'dispatch_intent_consumption_unknown'});});}
  catch{return respond(409,{error:'attempt_claim_unavailable_or_already_used',tokens:null});}
  let result;
  try{
   // No retries or automatic model changes. Death after dispatch intent leaves
   // an immutable unresolved attempt; the same grant cannot be sent again.
   const generated=await step('provider',BUDGET.provider,()=>compare(item,{execute:true,freeTierConfirmed:true,apiKey:process.env.GEMINI_API_KEY}));
   const mechanical=await step('validation',BUDGET.validation,()=>verifier.inspect(prepare(item),generated.draft));
   result={...meta,status:generated.status,model:generated.modelVersion||MODEL,providerRequestId:generated.providerRequestId||null,
    copy:mechanical.ok?flatten(generated.draft):null,generatedCopy:flatten(generated.draft),draft:generated.draft,mechanical,
    citationsPresent:citationsPresent(generated.draft,item),tokens:generated.tokens,quality:'unverified',publication:false,unreviewed:true,httpStatus:200};
  }catch(error){
   result={...meta,error:/^gemini_(?:http_\d+_no_retry|[a-z_]+)$/.test(String(error.message))?error.message:'gemini_comparison_failed_no_retry',
    tokens:error.tokens||null,rawGeneratedContent:error.rawCandidateText||null,providerRequestId:error.providerRequestId||null,httpStatus:/^gemini_http_(\d+)_/.exec(String(error.message))?.[1]||null,consumption:'unknown_unless_reported_by_provider',failureStage:stage};
  }
  try{await step('result_save',BUDGET.result_save,()=>store.finish(scope,{...record,result,timings:[...timings]}));}
  catch{return respond(503,{...meta,error:'result_save_failed_do_not_resend',tokens:result.tokens||null});}
  return respond(result.error?502:200,result);
 };
}
const handler=createHandler();module.exports=handler;
Object.assign(module.exports,{createHandler,loadItem,authorizedOrigin,citationsPresent,BUDGET});
