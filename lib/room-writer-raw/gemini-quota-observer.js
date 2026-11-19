'use strict';
// Read-only operational capacity observation. This is NOT Google quota remaining.
// The Gemini Developer API exposes model metadata, while the active Free-tier
// quota dashboard is separate. Never turn these observations into a dispatch grant.
const MODEL='gemini-3.8-flash',PROJECT='gen-lang-client-0210652653';
const LAST_OBSERVED=Object.freeze({rpm:5,tpm:250000,rpd:20,observedAt:'2026-11-16',source:'historical_owner_ai_studio'});
const KNOWN_SENDS=Object.freeze([
 {date:'2026-11-13',id:'independent-01',attempts:1},
 {date:'2026-11-14',id:'independent-02',attempts:1},
 {date:'2026-11-15',id:'independent-03',attempts:1},
 {date:'2026-11-16',id:'independent-04',attempts:1}
]);
function pacificDay(timestamp=Date.now()){
 if(!Number.isFinite(timestamp))throw Error('invalid_timestamp');
 return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Los_Angeles',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(timestamp));
}
function knownUsage({timestamp=Date.now(),events=KNOWN_SENDS}={}){
 const day=pacificDay(timestamp);
 // Archived dates reflect Japanese local execution days. Do not silently
 // reinterpret these as Pacific-day quota accounting evidence.
 const known=events.filter(e=>e.pacificDay===day && Number.isSafeInteger(e.attempts)&&e.attempts>0);
 const today=known.reduce((n,e)=>n+e.attempts,0);
 return {pacificDay:day,trackedAttemptsToday:today,trackedAttemptsTotal:events.reduce((n,e)=>n+(Number.isSafeInteger(e.attempts)&&e.attempts>0?e.attempts:0),0),
  dayAssignmentComplete:events.every(e=>typeof e.pacificDay==='string'),
  externalUsageKnown:false,googleRemaining:null,googleRemainingTokens:null,limitSource:'historical_not_current',
  priorObservedLimits:LAST_OBSERVED};
}
async function inspectModel({apiKey,fetchImpl=globalThis.fetch,signal=null}={}){
 if(!apiKey||typeof apiKey!=='string')return {model:MODEL,status:'key_missing',available:null,generationSupported:null,probeCalls:0,generationCalls:0};
 if(typeof fetchImpl!=='function')return {model:MODEL,status:'fetch_unavailable',available:null,generationSupported:null,probeCalls:0,generationCalls:0};
 try{
  const res=await fetchImpl('https://generativelanguage.googleapis.com/v1beta/models/'+MODEL,{
   method:'GET',headers:{'x-goog-api-key':apiKey},signal:signal||AbortSignal.timeout(5000)
  });
  if(!res.ok)return {model:MODEL,status:res.status===429?'metadata_rate_limited':'model_metadata_unavailable',httpStatus:res.status,available:null,generationSupported:null,probeCalls:1,generationCalls:0};
  // Bounded read; only allowlisted model capabilities are returned, never
  // API credentials, arbitrary provider error text or the full response.
  const metadata=await res.json();
  const matches=metadata?.name==='models/'+MODEL;
  const supports=Array.isArray(metadata?.supportedGenerationMethods)&&metadata.supportedGenerationMethods.includes('generateContent');
  return {model:MODEL,status:matches&&supports?'model_available':'model_capability_unverified',httpStatus:res.status,available:matches&&supports,generationSupported:supports,probeCalls:1,generationCalls:0};
 }catch{return {model:MODEL,status:'model_metadata_unavailable',available:null,generationSupported:null,probeCalls:1,generationCalls:0};}
}
async function observe({apiKey,fetchImpl,clock=Date.now}={}){
 const usage=knownUsage({timestamp:clock()});
 const model=await inspectModel({apiKey,fetchImpl});
 return {mode:'quota-observation',project:PROJECT,model:MODEL,usage,modelCheck:model,
  officialCurrentLimitsVerified:false,officialRemainingKnown:false,
  exactRemaining:null,readOnly:true,canAuthorizeGeneration:false,
  providerGenerationCalls:0,
  explanation:'App ledger and model metadata are not a Google Free-tier quota API. An unknown external request or changed provider limit cannot be inferred as zero.'};
}
module.exports={MODEL,PROJECT,LAST_OBSERVED,KNOWN_SENDS,pacificDay,knownUsage,inspectModel,observe};
