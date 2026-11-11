'use strict';
const {prepare,hash,freeze}=require('./source');
const {build,MODEL}=require('./contract');
const {admit,usageValid}=require('./safety');
const V=require('./verify');
const Q=require('./local-quality');
const historical=require('../../docs/measurements/s3-20261111/initial-probe.json');
const previouslyMeasured=new Set(historical.posts.map(p=>p.itemCode));
const preparedPlans=new WeakMap();
const hold=(reason,extra={})=>({status:'held',reason,qualityState:'unverified',calls:0,publication:false,copyable:false,...extra});
function localGenerate(item,options){return require('../urenavi-core/last-resort').generate(item,options);}
async function prepareFallback({item,mode='normal',generateLocal=localGenerate,verifiedCache=null,assessLocal=null}={}){
 if(!['normal','batch'].includes(mode))throw Error('raw_mode_invalid');
 let envelope=null,snapshot;try{envelope=prepare(item);}catch{}try{snapshot=structuredClone(item);}catch{return hold('local_input_invalid');}
 // Cache dependencies are injected by trusted server code, never product data.
 let cacheUnavailable=false,cacheUnverified=null;
 if(verifiedCache&&envelope){try{const cached=await verifiedCache({sourceHash:envelope.sourceHash,item:envelope.source,mode});if(Q.cachePassed(cached,envelope.sourceHash))return {status:'reuse_verified_cache',qualityState:'passed',calls:0,result:cached};if(cached)cacheUnverified=cached;}catch{cacheUnavailable=true;}}
 let local;try{local=await generateLocal(snapshot,{mode});}catch{return hold('local_quality_result_unavailable');}
 if(!local||local.groqCalls!==0)return hold('zero_call_local_result_required');
 let qualityPacket;try{qualityPacket=Q.packet({source:envelope?.source||snapshot,sourceHash:envelope?.sourceHash||hash(snapshot),local,mode});}catch{return hold('local_quality_packet_invalid');}
 const quality=await Q.assess(qualityPacket,assessLocal);
 if(quality.status==='passed')return {status:'reuse_quality_passed_local',qualityState:'passed',calls:0,result:local,quality};
 if(quality.status!=='failed')return {status:'local_quality_unverified',qualityState:'unverified',calls:0,publication:false,copyable:false,local,quality,qualityPacket};
 if(cacheUnverified)return hold('cache_quality_unverified',{qualityState:'failed',local,quality,cache:cacheUnverified});
 if(cacheUnavailable)return hold('verified_cache_unavailable',{qualityState:'failed',quality,local});
 if(!envelope)return hold('raw_source_invalid_after_local_failure',{qualityState:'failed',quality,local});
 if(previouslyMeasured.has(envelope.source.itemCode))return hold('previously_measured_product_no_resend',{qualityState:'failed',quality,local});
 const bundle=build(envelope);
 if(bundle.held)return hold(bundle.reason,{qualityState:'failed',quality,bundle,local});
 const plan=freeze({status:'fallback_prepared_not_authorized',qualityState:'failed',quality,calls:0,publication:false,copyable:false,local,bundle,mode});preparedPlans.set(plan,hash(plan));return plan;
}
async function execute({prepared,approval,limits,capacity,observedUsage,audit,executionSha,transport,reviewer=null,clock=Date.now}={}){
 if(prepared?.status!=='fallback_prepared_not_authorized'||preparedPlans.get(prepared)!==hash(prepared))return hold('fallback_not_prepared');
 const bundle=prepared.bundle;
 let state;try{state=audit?.state();}catch{return hold('audit_unavailable');}
 const admittedAt=clock(),gate=admit({bundle,quality:prepared.quality,approval,limits,capacity,observedUsage,state,executionSha,now:admittedAt});
 if(!gate.allow)return hold('admission_rejected',{holds:gate.holds});
 if(typeof transport!=='function')return hold('explicit_transport_required');
 let attempt;try{attempt=audit.begin(bundle,{executionSha,approvalHash:hash(approval),limits:gate.evidence.limits,admissionKind:gate.mode,capacityEvidence:gate.evidence.capacity,observedUsage:gate.evidence.observedUsage});}catch{return hold('attempt_record_failed_or_duplicate');}
 const start=clock();let response;
 if(start<admittedAt||start>=approval.expiresAt||[limits,capacity,observedUsage].some(x=>start-x.observedAt>60000)){
  try{audit.finish(attempt,{status:null,tokens:0,usage:{prompt_tokens:0,completion_tokens:0,total_tokens:0},usageSource:'not_sent',noProviderRequest:true,latencyMs:0,stop:'dispatch_evidence_expired_before_send',sourceHash:bundle.envelope.sourceHash,requestHash:bundle.requestHash,raw:null});}catch{return hold('pre_dispatch_storage_failed_do_not_retry');}
  return hold('dispatch_evidence_expired_before_send');
 }
 try{response=await transport(bundle.request);}catch{response={status:null};}
 const elapsed=Math.max(0,clock()-start),usage=response?.usage;
 let stop=response?.status===429?'provider_429':response?.status!==200?'transport_or_http_unknown':!usageValid(usage)?'usage_unknown':null;
 if(!stop&&(usage.prompt_tokens>bundle.inputEstimate||usage.completion_tokens>2000||usage.total_tokens>bundle.reservation))stop='reservation_exceeded';
 let raw=null,mechanical=null;
 if(!stop){
  if(response.finishReason!=='stop')stop='incomplete_output';
  else try{raw=typeof response.content==='string'?JSON.parse(response.content):null;mechanical=V.inspect(bundle.envelope,raw);}catch{stop='json_invalid';}
 }
 if(!stop&&gate.mode!=='initial_unknown'&&(!Number.isSafeInteger(response.capacity?.remainingMinuteTokens)||!Number.isSafeInteger(response.capacity?.remainingDailyRequests)))stop='provider_capacity_unknown';
 // Completion and usage are durably recorded before any independent review.
 const record={status:response?.status??null,tokens:usageValid(usage)?usage.total_tokens:null,usage:usageValid(usage)?usage:null,latencyMs:elapsed,stop,
  source:bundle.envelope.source,sourceHash:bundle.envelope.sourceHash,fieldHashes:bundle.envelope.fieldHashes,requestHash:bundle.requestHash,inputHash:bundle.inputHash,formattingHistory:bundle.envelope.formattingHistory,
  admissionKind:gate.mode,quality:prepared.quality,officialLimits:gate.evidence.limits,observedUsage:gate.evidence.observedUsage,capacityBefore:gate.evidence.capacity,providerCapacity:response?.capacity||null,raw,mechanical};
 try{audit.finish(attempt,record);}catch{return {status:'storage_failed_do_not_retry',calls:1,publication:false,copyable:false,usage:record.usage,latencyMs:elapsed};}
 if(stop)return {status:'stopped',reason:stop,calls:1,publication:false,copyable:false,usage:record.usage,latencyMs:elapsed};
 const verdict=await V.review(bundle.envelope,freeze(raw),reviewer);
 try{audit.recordReview(attempt,{sourceHash:bundle.envelope.sourceHash,draftHash:hash(raw),verdict});}catch{return {status:'review_storage_failed_do_not_retry',calls:1,publication:false,copyable:false,usage:record.usage,latencyMs:elapsed};}
 return {status:verdict.status,calls:1,executionStopped:gate.mode==='initial_unknown',stopReason:gate.mode==='initial_unknown'?'initial_probe_complete_review_required':null,publication:false,copyable:false,usage:record.usage,latencyMs:elapsed,draft:raw,verdict,reviewPacket:V.reviewPacket(bundle.envelope,raw)};
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
