'use strict';
// In-memory isolated laboratory budget only. No existing claim/journal/Blob access.
// Unknown provider usage / 429 / transport uncertainty fail closed with no retry.
const DAILY=150000,TPM=8000,MAX_OUTPUT=2000;
function budget({dayUsed,minuteUsed,inputEstimate,outputReserve=MAX_OUTPUT,unresolved=true,capacityObserved=false,now=Date.now()}={}){
 if(unresolved||capacityObserved!==true)return {allow:false,reason:'unknown_consumption_hold'};
 if(!Number.isSafeInteger(dayUsed)||dayUsed<0||!Number.isSafeInteger(minuteUsed)||minuteUsed<0||!Number.isSafeInteger(inputEstimate)||inputEstimate<0||!Number.isSafeInteger(outputReserve)||outputReserve<0||outputReserve>MAX_OUTPUT)
  return {allow:false,reason:'invalid_capacity_observation'};
 const reserved=inputEstimate+outputReserve;
 if(reserved>TPM-minuteUsed)return {allow:false,reason:'tpm_8000_exceeded',reserved};
 if(reserved>Math.min(DAILY,200000)-dayUsed)return {allow:false,reason:'daily_budget_exceeded',reserved};
 return {allow:true,reason:'reserved_for_one_attempt_only',reserved,now};
}
function settle(usage){
 const u=usage||{};
 if(!Number.isSafeInteger(u.prompt_tokens)||u.prompt_tokens<0||!Number.isSafeInteger(u.completion_tokens)||u.completion_tokens<0)
  return {ok:false,stop:true,reason:'unknown_usage_do_not_retry'};
 return {ok:true,stop:false,consumed:u.prompt_tokens+u.completion_tokens};
}
function onResponse(status,usage){
 if(status===429)return {ok:false,stop:true,reason:'429_do_not_retry'};
 if(status!==200)return {ok:false,stop:true,reason:'failed_or_uncertain_do_not_retry'};
 return settle(usage);
}
module.exports={budget,settle,onResponse,DAILY,TPM,MAX_OUTPUT};
