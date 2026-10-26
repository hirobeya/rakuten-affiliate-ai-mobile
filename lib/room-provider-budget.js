'use strict';
const {createHash,randomUUID}=require('node:crypto');
const {duration}=require('./room-semantic-provider');
const TABLE='urenavi_product_understanding_cache';
const VERSION='room_provider_budget_v1';
const LEASE_MS=120000,UNKNOWN_WAIT_MS=65000,MIN_INTERVAL_MS=2100;
function unavailable(){const e=new Error('Provider budget unavailable');e.status=503;return e;}
// Server-only coordination rows use the existing service-role-only cache table.
// They never contain a key, user data or a product understanding result.
function createBudgetStore(db,scope){
 const key=createHash('sha256').update(VERSION+'|'+scope).digest('hex');
 const query=new URLSearchParams({cache_key:'eq.'+key,select:'raw_ai_json',limit:'1'});
 return {
  async load(){
   let rows=await db(TABLE+'?'+query);
   if(!rows?.length){
    const state={revision:randomUUID(),models:{}};
    await db(TABLE,{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify({cache_key:key,item_code:'__'+VERSION,source_hash:key,item_name:VERSION,item_caption_normalized:'',model:'budget',prompt_version:VERSION,schema_version:VERSION,raw_ai_json:state,result_status:'ok',expires_at:null})});
    rows=await db(TABLE+'?'+query);
   }
   const state=rows?.[0]?.raw_ai_json;
   if(!state?.revision||!state.models)throw unavailable();
   return state;
  },
  async swap(revision,state){
   const q=new URLSearchParams({cache_key:'eq.'+key,'raw_ai_json->>revision':'eq.'+revision,select:'cache_key'});
   const rows=await db(TABLE+'?'+q,{method:'PATCH',headers:{Prefer:'return=representation'},body:JSON.stringify({raw_ai_json:state,updated_at:new Date().toISOString()})});
   return Array.isArray(rows)&&rows.length===1;
  }
 };
}
function waitFor(budget={},requiredTokens=0,now=Date.now()){
 let until=Number(budget.notBefore)||0;
 if(budget.tokenResetAt>now&&Number(budget.remainingTokens)<requiredTokens)until=Math.max(until,budget.tokenResetAt);
 if(budget.requestResetAt>now&&Number(budget.remainingRequests)<1)until=Math.max(until,budget.requestResetAt);
 return Math.max(0,until-now);
}
function observedBudget(response,error,now){
 const h=response?.rateLimit||error?.rateLimit||{};
 const knownTokens=h['x-ratelimit-remaining-tokens']!==undefined&&Number.isFinite(Number(h['x-ratelimit-remaining-tokens']));
 const knownRequests=h['x-ratelimit-remaining-requests']!==undefined&&Number.isFinite(Number(h['x-ratelimit-remaining-requests']));
 const reset=(field)=>{const ms=duration(h[field]);return ms>0?now+ms+1000:0;};
 return {notBefore:now+Math.max(MIN_INTERVAL_MS,(!knownTokens||!knownRequests||error)?UNKNOWN_WAIT_MS:0,Number(error?.retryAfterMs)||0),
  remainingTokens:knownTokens?Number(h['x-ratelimit-remaining-tokens']):null,tokenResetAt:reset('x-ratelimit-reset-tokens'),
  remainingRequests:knownRequests?Number(h['x-ratelimit-remaining-requests']):null,requestResetAt:reset('x-ratelimit-reset-requests')};
}
function withSharedBudget(provider,{store,now=Date.now,uuid=randomUUID}={}){
 return {...provider,async acquire(stage,item,state){
  try{
   const row=await store.load(),time=now(),budget=row.models[provider.model]||{};
   // A worker can disappear after sending. Expiry permits lock recovery only
   // when no send was recorded; it is not proof of zero provider consumption.
   if(row.uncertain||row.lease?.sent&&row.lease.until<=time)throw unavailable();
   const waitMs=Math.max(0,(Number(row.notBefore)||0)-time,waitFor(budget,provider.requiredTokens(stage,item,state),time),row.lease?.until>time?Math.min(5000,row.lease.until-time):0);
   if(waitMs>0)return {waitMs};
   const token=uuid(),locked={...row,revision:uuid(),lease:{token,until:time+LEASE_MS}};
   if(!await store.swap(row.revision,locked))return {waitMs:1000};
   return {waitMs:0,async markSent(){
    const current=await store.load();
    if(current.lease?.token!==token||current.lease.until<=now())throw unavailable();
    const next={...current,revision:uuid(),lease:{...current.lease,sent:true}};
    if(!await store.swap(current.revision,next))throw unavailable();
   },async release({response,error,called,progressSaved=true}){
    const current=await store.load();
    // An expired lease can have a new owner. Never overwrite that owner's state.
    if(current.lease?.token!==token)throw unavailable();
    const next={...current,revision:uuid(),lease:null,models:{...current.models}};
    if(called){next.models[provider.model]=observedBudget(response,error,now());next.notBefore=next.models[provider.model].notBefore;}
    const usage=response?.usage||error?.usage;
    const input=usage?.input_tokens??usage?.prompt_tokens,output=usage?.output_tokens??usage?.completion_tokens;
    if(called&&(!progressSaved||!Number.isSafeInteger(input)||input<0||!Number.isSafeInteger(output)||output<0)){
     next.uncertain={model:provider.model,at:now(),reason:progressSaved?'usage_unknown':'progress_not_saved'};
    }
    if(!await store.swap(current.revision,next))throw unavailable();
   }};
  }catch{throw unavailable();}
 }};
}
module.exports={VERSION,createBudgetStore,withSharedBudget,waitFor,observedBudget};
