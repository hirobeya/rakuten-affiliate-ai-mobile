'use strict';
// No fetch, environment credentials, DB, billing, or production stores.
const fs=require('node:fs');const path=require('node:path');
const C=require('./contracts');
const A=require('./admission');
const B=require('./capacity-analysis');
const ENGINE_VERSION=C.VERSION+'_'+C.hash(fs.readFileSync(__filename,'utf8')+fs.readFileSync(require.resolve('./admission'),'utf8')+fs.readFileSync(require.resolve('./capacity-analysis'),'utf8')).slice(0,16);
function atomic(file,data){const tmp=file+'.tmp';const fd=fs.openSync(tmp,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(data,null,2));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);const dir=fs.openSync(path.dirname(file),'r');try{fs.fsyncSync(dir);}finally{fs.closeSync(dir);}}
function maxValue(s){if(s.enum)return s.enum.reduce((a,b)=>String(a).length>String(b).length?a:b);if(s.type==='object')return Object.fromEntries(Object.entries(s.properties).map(([k,v])=>[k,maxValue(v)]));if(s.type==='array')return Array.from({length:s.maxItems},()=>maxValue(s.items));if(s.type==='string')return '漢'.repeat(s.maxLength);if(s.type==='integer')return 999999999;return false;}
function capacityPlan(item,conditions={}){const draft=maxValue(C.WRITE_SCHEMA);const failures=Array.from({length:64},()=>({rule:'failure'.repeat(8),id:'id',detail:'漢'.repeat(200)}));return ['draft','review','rewrite','rereview'].map(stage=>({stage,...C.estimate(C.request(stage,item,{draft,failures,conditions}))}));}
function fail(code){const e=new Error(code);e.code=code;return e;}
function usageOK(u){return u&&['prompt_tokens','completion_tokens','total_tokens'].every(k=>Number.isSafeInteger(u[k])&&u[k]>=0)&&u.total_tokens===u.prompt_tokens+u.completion_tokens;}
async function run({item,directory,transport,limits,conditions={},admission=null,clock=Date.now}){
 if(!Object.keys(require.cache).some(p=>p.endsWith('/scripts/rebuild/offline-guard.cjs')))throw fail('offline_guard_required');
 item=C.source(item);if(typeof transport!=='function')throw fail('mock_transport_required');
 if(!path.isAbsolute(directory))throw fail('absolute_experiment_directory_required');
 fs.mkdirSync(directory,{recursive:true,mode:0o700});
 // The global lock serializes all products sharing this isolated budget.
 // A crash leaves the lock: manual reconciliation is mandatory, never TTL retry.
 const lock=path.join(directory,'execution.lock');let fd;
 try{fd=fs.openSync(lock,'wx',0o600);}catch{throw fail('execution_locked');}
 let ledger;
 const ledgerFile=path.join(directory,'ledger.json');
 const key=C.hash({sourceHash:C.hash(item),model:C.MODEL,version:ENGINE_VERSION,conditions,admission,safety:'existing-veto+strict-plan-v1'});
 const resultFile=path.join(directory,key+'.json');
 const persist=()=>atomic(ledgerFile,ledger);
 let state;
 try{
  ledger=fs.existsSync(ledgerFile)?JSON.parse(fs.readFileSync(ledgerFile,'utf8')):{version:1,limits:null,spent:0,reserved:0,requests:0,halt:null,keys:{}};
  if(ledger.version!==1)throw fail('ledger_version_unknown');
  if(!['spent','reserved','requests'].every(k=>Number.isSafeInteger(ledger[k])&&ledger[k]>=0)||!ledger.keys||typeof ledger.keys!=='object'||Array.isArray(ledger.keys)||Object.values(ledger.keys).some(v=>!v||!['ready','incomplete','reserved','sent_unknown'].includes(v.status)||!Number.isSafeInteger(v.reservation)||v.reservation<0)||Object.values(ledger.keys).reduce((a,v)=>a+v.reservation,0)!==ledger.reserved)throw fail('ledger_corrupt');
  if(ledger.admissionHash){
   A.validateEvents(ledger);
   if(!admission||ledger.admissionHash!==C.hash(admission))throw fail('admission_change_requires_reconciliation');
  }
  const prior=ledger.keys[key];
  if(prior?.status==='ready'){
   const saved=JSON.parse(fs.readFileSync(resultFile,'utf8'));
   if(saved.key!==key||saved.version!==ENGINE_VERSION||C.hash(saved.source)!==C.hash(item)||!C.review(item,saved.draft,saved.review).ok)throw fail('cache_invalid');
   return {...saved,cache:'hit',callsThisRun:0};
  }
  if(ledger.halt)throw fail(ledger.halt);
  if(Object.values(ledger.keys).some(v=>v.status==='sent_unknown'))throw fail('unreconciled_send');
  if(prior)throw fail('duplicate_suppressed');
  if(!limits||!['tokens','requests','perCallTokens'].every(k=>Number.isSafeInteger(limits[k])&&limits[k]>0))throw fail('budget_unknown');
  if(ledger.limits&&C.hash(ledger.limits)!==C.hash(limits))throw fail('budget_change_requires_reconciliation');
  ledger.limits=limits;
  if(admission){
   A.validate(admission);
   if(ledger.admissionHash&&ledger.admissionHash!==C.hash(admission))throw fail('admission_change_requires_reconciliation');
   if(!ledger.admissionHash){if(ledger.requests||ledger.spent||ledger.reserved)throw fail('rate_ledger_migration_forbidden');ledger.admissionHash=C.hash(admission);ledger.events=[];ledger.lastClock=0;}
   A.validateEvents(ledger);
  }else if(ledger.admissionHash)throw fail('admission_required');
  const plan=admission?A.preflight(admission,ledger,clock()):capacityPlan(item,conditions),reservation=plan.reduce((a,r)=>a+r.total,0);
  if(plan.some(r=>r.total>limits.perCallTokens)||ledger.spent+ledger.reserved+reservation>limits.tokens||ledger.requests+4>limits.requests)throw fail('capacity_insufficient');
  state={key,version:ENGINE_VERSION,source:item,conditions,status:'pending',calls:[],history:[],budget:plan};
  ledger.reserved+=reservation;ledger.keys[key]={status:'reserved',reservation};persist();
  const save=()=>atomic(resultFile,state);
  async function call(stage){
   if(state.calls.length>=4||ledger.halt)throw fail(ledger.halt||'call_limit');
   const req=C.request(stage,item,state),estimate=C.estimate(req);
   const cap=plan.find(p=>p.stage===stage);
   if(estimate.total>cap.total||estimate.total>limits.perCallTokens||ledger.requests>=limits.requests)throw fail('capacity_insufficient');
   const attemptId=C.hash([key,stage]);
   if(admission)A.before(admission,ledger,req,stage,attemptId,clock());
   const entry={stage,attemptId,status:'sent_unknown',estimate};
   state.calls.push(entry);ledger.requests++;ledger.keys[key].status='sent_unknown';persist();save();
   let response;
   try{response=await transport(req,{stage,attemptId:entry.attemptId});}catch(e){ledger.halt=e.status===429?'provider_429':'transport_unknown';persist();throw fail(ledger.halt);}
   if(response?.status===429){ledger.halt='provider_429';persist();throw fail(ledger.halt);}
   if(response?.status!==undefined&&response.status!==200){ledger.halt='provider_http_error';persist();throw fail(ledger.halt);}
   if(!usageOK(response?.usage)){ledger.halt='usage_unknown';persist();throw fail(ledger.halt);}
   if(admission){if(response.usage.prompt_tokens>estimate.input)throw fail('input_usage_exceeded_reservation');if(response.usage.completion_tokens>C.MAX_OUTPUT)throw fail('usage_exceeded_reservation');A.settle(ledger,entry.attemptId,response.usage,clock());}
   entry.usage=response.usage;entry.status='received';ledger.spent+=response.usage.total_tokens;ledger.reserved-=cap.total;ledger.keys[key].reservation-=cap.total;
   if(response.usage.total_tokens>cap.total||response.usage.completion_tokens>C.MAX_OUTPUT){ledger.halt='usage_exceeded_reservation';persist();throw fail(ledger.halt);}
   if(response.finish_reason!=='stop'){ledger.halt='output_incomplete';persist();throw fail(ledger.halt);}
   persist();save();
   // Invalid writer structures must not create an unbounded rewrite input.
   if((stage==='draft'||stage==='rewrite')&&Buffer.byteLength(JSON.stringify(response.raw),'utf8')>B.candidateLimit())throw fail('candidate_storage_envelope_exceeded');
   return response.raw;
  }
  for(let attempt=0;attempt<2;attempt++){
   state.draft=await call(attempt?'rewrite':'draft');
   let check=C.inspect(item,state.draft);
   if(check.ok){state.review=await call(attempt?'rereview':'review');check=C.review(item,state.draft,state.review);}
   state.failures=check.failures.slice(0,64).map(f=>({rule:String(f.rule).slice(0,56),id:String(f.id??f.sentence??''),detail:String(f.detail||'').slice(0,200)}));
   state.history.push({attempt,draft:state.draft,review:state.review||null,failures:check.failures});
   state.review=check.ok?state.review:null;
   if(check.ok){state.status='ready';state.output={product:state.draft.product,sentences:state.draft.sentences};break;}
  }
  if(state.status!=='ready')state.status='incomplete';
  ledger.reserved-=ledger.keys[key].reservation;ledger.keys[key]={status:state.status,reservation:0};
  // Publish only after durable artifact and ledger. Failures remain suppression entries.
  save();persist();return {...state,cache:'miss',callsThisRun:state.calls.length};
 }catch(e){
  if(ledger&&state){ledger.halt=ledger.halt||'storage_or_execution_failed';try{persist();}catch{} }
  throw e;
 }finally{fs.closeSync(fd);fs.unlinkSync(lock);}
}
module.exports={run,capacityPlan,usageOK,ENGINE_VERSION};
