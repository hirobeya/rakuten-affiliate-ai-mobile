'use strict';
// Shared HTTP algorithm; live authentication is limited to the frozen one-call experiment.
const fs=require('node:fs'),path=require('node:path'),W=require('./chat-wire'),C=require('./contracts'),L=require('./live-calibration');
function fault(code){const e=new Error(code);e.code=code;return e;}
function write(file,value){const tmp=file+'.tmp';const fd=fs.openSync(tmp,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);const d=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(d);}finally{fs.closeSync(d);}}
const MOCK_BEARER='urenavi-offline-auth-fixture';
function rateLimits(response){
 const get=k=>typeof response.headers?.get==='function'?response.headers.get(k):null;
 const number=k=>{const v=get(k);return typeof v==='string'&&/^\d+$/.test(v)&&Number.isSafeInteger(Number(v))?Number(v):null;};
 const reset=k=>{const v=get(k);return typeof v==='string'&&/^(?:\d+(?:\.\d+)?(?:ms|s|m|h|d))+$/.test(v)?v:null;};
 return {requestLimit:number('x-ratelimit-limit-requests'),requestRemaining:number('x-ratelimit-remaining-requests'),tokenLimit:number('x-ratelimit-limit-tokens'),tokenRemaining:number('x-ratelimit-remaining-tokens'),requestReset:reset('x-ratelimit-reset-requests'),tokenReset:reset('x-ratelimit-reset-tokens')};
}
function create({directory,http=global.fetch,timeoutMs=30000,save=write,journalMode='full',mockAuthentication=null,calibrationProfile=null,liveAuthorization=null,liveContext=null}){
 const guarded=Object.keys(require.cache).some(p=>p.endsWith('/scripts/rebuild/offline-guard.cjs'));
 if(!guarded&&!liveAuthorization)throw fault('offline_guard_required');
 if(liveAuthorization&&(typeof liveAuthorization!=='function'||mockAuthentication!==null||calibrationProfile!=='first-call-1000'))throw fault('live_authentication_configuration');
 if(liveAuthorization&&!guarded&&http!==global.fetch)throw fault('live_http_override_forbidden');
 if(liveAuthorization){
  if(!liveContext||journalMode!=='usage-only'||directory!==path.join(L.STATE_DIRECTORY,'http'))throw fault('live_transport_context_required');
  L.validate({...liveContext,directory:L.STATE_DIRECTORY,wireHash:L.WIRE_HASH,now:liveContext.clock(),calibrationProfile,liveAuthorization,mockAuthentication});
 }
 if(!['full','usage-only'].includes(journalMode)||!path.isAbsolute(directory)||!Number.isSafeInteger(timeoutMs)||timeoutMs<=0)throw fault('transport_configuration');
 if(mockAuthentication!==null&&(mockAuthentication.mode!=='offline-mock'||mockAuthentication.bearer!==MOCK_BEARER))throw fault('mock_authentication_required');
 fs.mkdirSync(directory,{recursive:true,mode:0o700});
 const journal=path.join(directory,'transport.json'),lock=path.join(directory,'transport.lock');
 return async function send(req,{stage,attemptId}){
  if(calibrationProfile!==null&&calibrationProfile!=='first-call-1000')throw fault('calibration_profile_unknown');
  if(calibrationProfile&&stage!=='draft')throw fault('calibration_stage_forbidden');
  const wire=calibrationProfile?W.compileCalibration1000(req):W.compileRequest(req);
  if(liveAuthorization&&(stage!=='draft'||C.hash(wire.body)!==L.WIRE_HASH))throw fault('live_wire_forbidden');
  if(!['draft','review','rewrite','rereview'].includes(stage)||typeof attemptId!=='string'||!attemptId)throw fault('attempt_required');
  // Exclusive lock has no expiry. Storage failure retains it across process restarts.
  if(liveAuthorization){
   L.validate({...liveContext,directory:L.STATE_DIRECTORY,wireHash:L.WIRE_HASH,now:liveContext.clock(),calibrationProfile,liveAuthorization,mockAuthentication});
   const l=JSON.parse(fs.readFileSync(path.join(L.STATE_DIRECTORY,'calibration.json'),'utf8'));
   if(l.runtimeMode!=='live-calibration'||l.status!=='sent_unknown'||l.attemptId!==attemptId||l.wireHash!==L.WIRE_HASH||l.requests!==1||l.reserved!==6000||l.spent!==0||l.events?.length!==1||l.events[0].id!==attemptId||l.events[0].status!=='pending'||l.events[0].input!==5000||l.events[0].output!==1000||l.events[0].tokens!==6000||['grant','evidence','account','isolation'].some(k=>l.snapshotHashes?.[k]!==C.hash(liveContext[k])))throw fault('live_capacity_journal_mismatch');
  }
  let fd;try{fd=fs.openSync(lock,'wx',0o600);}catch{throw fault('transport_locked');}
  let durable=false,timer,state;
  try{
   state=fs.existsSync(journal)?JSON.parse(fs.readFileSync(journal,'utf8')):{version:1,halt:null,attempts:{}};
   if(state.version!==1||!state.attempts||typeof state.attempts!=='object'||Array.isArray(state.attempts)||Object.values(state.attempts).some(v=>!v||!['sent_unknown','received'].includes(v.status)||v.status==='received'&&(!v.response||!v.usage||!['prompt_tokens','completion_tokens','total_tokens'].every(k=>Number.isSafeInteger(v.usage[k])&&v.usage[k]>=0)||v.usage.prompt_tokens+v.usage.completion_tokens!==v.usage.total_tokens)))throw fault('transport_ledger_corrupt');
   if(state.halt||Object.values(state.attempts).some(v=>v.status==='sent_unknown'))throw fault('transport_halted');
   if(Object.hasOwn(state.attempts,attemptId))throw fault('duplicate_suppressed');
   state.attempts[attemptId]={stage,requestHash:C.hash(wire.body),status:'sent_unknown'};
   await save(journal,state);durable=true;
   const controller=new AbortController();
   const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(fault('transport_timeout_unknown'));},timeoutMs);});
   const operation=(async()=>{
    let authorization;
    if(liveAuthorization){try{authorization=liveAuthorization();}catch{throw fault('live_authentication_unavailable');}
     if(typeof authorization!=='string'||!/^Bearer [^\s]+$/.test(authorization))throw fault('live_authentication_unavailable');}
    const response=await http(W.ENDPOINT,{method:'POST',redirect:'error',signal:controller.signal,headers:{'Content-Type':'application/json',...(authorization?{Authorization:authorization}:mockAuthentication?{Authorization:'Bearer '+MOCK_BEARER}:{})},body:wire.serializedBody});
    state.attempts[attemptId].httpStatus=Number.isInteger(response.status)?response.status:null;
    if(liveAuthorization)state.attempts[attemptId].rateLimits=rateLimits(response);
    durable=false;await save(journal,state);durable=true;
    if(response.redirected||response.url&&response.url!==W.ENDPOINT)throw fault('redirect_forbidden');
    if(response.status===429)throw fault('provider_429');
    if(response.status!==200)throw fault('provider_http_error');
    const body=await response.json();
    return {body,status:response.status};
   })();
   const result=await Promise.race([operation,timeout]);
   clearTimeout(timer);
   const u=result.body?.usage;
   if(u&&['prompt_tokens','completion_tokens','total_tokens'].every(k=>Number.isSafeInteger(u[k])&&u[k]>=0)&&u.prompt_tokens+u.completion_tokens===u.total_tokens){
    const reportedUsage={prompt_tokens:u.prompt_tokens,completion_tokens:u.completion_tokens,total_tokens:u.total_tokens};
    const reasoning=u.completion_tokens_details?.reasoning_tokens;
    if(reasoning!==undefined&&(!Number.isSafeInteger(reasoning)||reasoning<0||reasoning>u.completion_tokens))throw fault('usage_unknown');
    if(Number.isSafeInteger(reasoning)&&reasoning>=0&&reasoning<=u.completion_tokens)reportedUsage.reasoning_tokens=reasoning;
    state.attempts[attemptId].reportedUsage=reportedUsage;
    durable=false;await save(journal,state);durable=true;
   }
   result.decoded=W.decodeResponse({status:result.status,body:result.body},stage,calibrationProfile?1000:C.MAX_OUTPUT);
   const recordedResponse=journalMode==='usage-only'?{model:C.MODEL,contentHash:C.hash(result.decoded.raw),finishReason:result.decoded.finish_reason}:result.body;
   state.attempts[attemptId]={...state.attempts[attemptId],status:'received',response:recordedResponse,usage:result.decoded.usage};
   durable=false;await save(journal,state);durable=true;
   return result.decoded; // Only returned to engine; engine alone decides publication.
  }catch(e){
   if(state){state.halt=['live_authentication_unavailable','provider_429','provider_http_error','redirect_forbidden','transport_timeout_unknown','response_unknown','usage_unknown','usage_exceeded_reservation','output_incomplete','invalid_structured_json','candidate_storage_envelope_exceeded','transport_ledger_corrupt','transport_halted','duplicate_suppressed'].includes(e.code)?e.code:'transport_unknown';try{await save(journal,state);durable=true;}catch{durable=false;}}
   if(liveAuthorization)throw fault(state?.halt||'transport_unknown');
   throw e;
  }finally{clearTimeout(timer);fs.closeSync(fd);if(durable)fs.unlinkSync(lock);}
 };
}
module.exports={create,MOCK_BEARER};
