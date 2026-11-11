'use strict';
const {prepare,hash,freeze}=require('./source');
const {build,MODEL}=require('./contract');
const {admit,usageValid}=require('./safety');
const V=require('./verify');
const historical=require('../../docs/measurements/s3-20261111/initial-probe.json');
const previouslyMeasured=new Set(historical.posts.map(p=>p.itemCode));
const preparedPlans=new WeakMap();
const hold=(reason,extra={})=>({status:'held',reason,calls:0,publication:false,copyable:false,...extra});
function localGenerate(item,options){return require('../urenavi-core/last-resort').generate(item,options);}
async function prepareFallback({item,mode='normal',generateLocal=localGenerate,verifiedCache=null}={}){
 if(!['normal','batch'].includes(mode))throw Error('raw_mode_invalid');
 let envelope=null,snapshot;try{envelope=prepare(item);}catch{}try{snapshot=structuredClone(item);}catch{return hold('local_input_invalid');}
 // Cache dependencies are injected by trusted server code, never product data.
 let cacheUnavailable=false;
 if(verifiedCache&&envelope){try{const cached=await verifiedCache({sourceHash:envelope.sourceHash,item:envelope.source,mode});if(cached?.sourceHash===envelope.sourceHash&&cached.independentlyReviewed===true&&typeof cached.text==='string'&&cached.text.trim())return {status:'reuse_verified_cache',calls:0,result:cached};}catch{cacheUnavailable=true;}}
 let local;try{local=await generateLocal(snapshot,{mode});}catch{return hold('local_quality_result_unavailable');}
 if(!local||local.groqCalls!==0)return hold('zero_call_local_result_required');
 // Existing local output is always preserved; incomplete human review is no
 // excuse to spend Groq tokens. The old engine and its publication gate stay intact.
 if(local.result)return {status:'reuse_existing_local_result',calls:0,result:local,qualityCertified:local.qualityCertified===true};
 if(local.localStatus!=='incomplete'||!local.diagnostic)return hold('explicit_local_quality_failure_required');
 if(cacheUnavailable)return hold('verified_cache_unavailable',{local});
 if(!envelope)return hold('raw_source_invalid_after_local_failure',{local});
 if(previouslyMeasured.has(envelope.source.itemCode))return hold('previously_measured_product_no_resend',{local});
 const bundle=build(envelope);
 if(bundle.held)return hold(bundle.reason,{bundle,local});
 const plan=freeze({status:'fallback_prepared_not_authorized',calls:0,publication:false,copyable:false,local,bundle,mode});preparedPlans.set(plan,hash(plan));return plan;
}
async function execute({prepared,approval,limits,capacity,audit,executionSha,transport,reviewer=null,clock=Date.now}={}){
 if(prepared?.status!=='fallback_prepared_not_authorized'||preparedPlans.get(prepared)!==hash(prepared))return hold('fallback_not_prepared');
 const bundle=prepared.bundle;
 let state;try{state=audit?.state();}catch{return hold('audit_unavailable');}
 const gate=admit({bundle,approval,limits,capacity,state,executionSha,now:clock()});
 if(!gate.allow)return hold('admission_rejected',{holds:gate.holds});
 if(typeof transport!=='function')return hold('explicit_transport_required');
 let attempt;try{attempt=audit.begin(bundle,{executionSha,approvalHash:hash(approval),limits});}catch{return hold('attempt_record_failed_or_duplicate');}
 const start=clock();let response;
 try{response=await transport(bundle.request);}catch{response={status:null};}
 const elapsed=Math.max(0,clock()-start),usage=response?.usage;
 let stop=response?.status===429?'provider_429':response?.status!==200?'transport_or_http_unknown':!usageValid(usage)?'usage_unknown':null;
 if(!stop&&(usage.prompt_tokens>bundle.inputEstimate||usage.completion_tokens>2000||usage.total_tokens>bundle.reservation))stop='reservation_exceeded';
 let raw=null,mechanical=null;
 if(!stop){
  if(response.finishReason!=='stop')stop='incomplete_output';
  else try{raw=typeof response.content==='string'?JSON.parse(response.content):null;mechanical=V.inspect(bundle.envelope,raw);}catch{stop='json_invalid';}
 }
 if(!stop&&(!Number.isSafeInteger(response.capacity?.remainingMinuteTokens)||!Number.isSafeInteger(response.capacity?.remainingDailyRequests)))stop='provider_capacity_unknown';
 // Completion and usage are durably recorded before any independent review.
 const record={status:response?.status??null,tokens:usageValid(usage)?usage.total_tokens:null,usage:usageValid(usage)?usage:null,latencyMs:elapsed,stop,
  source:bundle.envelope.source,sourceHash:bundle.envelope.sourceHash,fieldHashes:bundle.envelope.fieldHashes,requestHash:bundle.requestHash,inputHash:bundle.inputHash,formattingHistory:bundle.envelope.formattingHistory,
  capacityBefore:capacity,providerCapacity:response?.capacity||null,raw,mechanical};
 try{audit.finish(attempt,record);}catch{return {status:'storage_failed_do_not_retry',calls:1,publication:false,copyable:false,usage:record.usage,latencyMs:elapsed};}
 if(stop)return {status:'stopped',reason:stop,calls:1,publication:false,copyable:false,usage:record.usage,latencyMs:elapsed};
 const verdict=await V.review(bundle.envelope,freeze(raw),reviewer);
 try{audit.recordReview(attempt,{sourceHash:bundle.envelope.sourceHash,draftHash:hash(raw),verdict});}catch{return {status:'review_storage_failed_do_not_retry',calls:1,publication:false,copyable:false,usage:record.usage,latencyMs:elapsed};}
 return {status:verdict.status,calls:1,publication:false,copyable:false,usage:record.usage,latencyMs:elapsed,draft:raw,verdict,reviewPacket:V.reviewPacket(bundle.envelope,raw)};
}
function createTransport({apiKey,fetchImpl=global.fetch}={}){
 if(typeof apiKey!=='string'||!apiKey||typeof fetchImpl!=='function')throw Error('explicit_provider_credentials_required');
 return async request=>{
  if(request.model!==MODEL||request.reasoning_effort!=='low'||request.max_completion_tokens!==2000)throw Error('provider_contract_mismatch');
  const r=await fetchImpl('https://api.groq.com/openai/v1/chat/completions',{method:'POST',redirect:'error',headers:{authorization:'Bearer '+apiKey,'content-type':'application/json'},body:JSON.stringify(request),signal:AbortSignal.timeout(90000)});
  let b;try{b=await r.json();}catch{return {status:r.status,usage:null};}
  const integer=k=>{const v=r.headers.get(k);return v!==null&&/^\d+$/.test(v)?Number(v):null;};
  return {status:r.status,usage:b?.usage||null,content:b?.choices?.[0]?.message?.content||null,finishReason:b?.choices?.[0]?.finish_reason||null,
   capacity:{remainingMinuteTokens:integer('x-ratelimit-remaining-tokens'),remainingDailyRequests:integer('x-ratelimit-remaining-requests'),remainingDailyTokens:null}};
 };
}
module.exports={prepareFallback,execute,createTransport};
