'use strict';
const {createHash}=require('node:crypto');

function groqPlan(env=process.env){
 const plan=env.URENAVI_GROQ_PLAN??'free';
 return plan==='free'||plan==='paid'?plan:null;
}
const positive=value=>Number.isSafeInteger(value)&&value>0;

function paidCapacityPolicy({key,env=process.env,now=Date.now()}={}){
 if(groqPlan(env)!=='paid'||env.VERCEL_ENV!=='production'
  ||env.URENAVI_GROQ_PAID_ENABLED!=='approved_paid'||!key)return null;
 try{
  const evidence=JSON.parse(env.URENAVI_GROQ_PAID_EVIDENCE||'null');
  const observed=Date.parse(evidence?.verifiedAt),expires=Date.parse(evidence?.expiresAt);
  const {inputNanoUsdPerToken:input,outputNanoUsdPerToken:output,
   organizationDailyBudgetNanoUsd:org,tenantDailyBudgetNanoUsd:tenant}=evidence||{};
  if(evidence?.plan!=='paid'||evidence.approved!==true||
   !/^[a-f0-9]{64}$/.test(evidence.evidenceHash||'')||
   evidence.keyHash!==createHash('sha256').update(key).digest('hex')||
   !(observed<=now&&now<expires&&expires-observed<=3600000)||
   ![input,output,org,tenant].every(positive)||tenant>org)return null;
  // Budget ceilings are converted conservatively with the higher tariff.
  // The database compares these against its existing authoritative day windows.
  const ceiling=Math.max(input,output);
  const organizationDailyTokens=Math.floor(org/ceiling);
  const tenantDailyTokens=Math.floor(tenant/ceiling);
  if(!positive(tenantDailyTokens)||organizationDailyTokens>1000000000)return null;
  return {inputNanoUsdPerToken:input,outputNanoUsdPerToken:output,organizationDailyTokens,tenantDailyTokens};
 }catch{return null;}
}

function estimateGroqNanoUsd(usage,prices){
 const input=usage?.input_tokens??usage?.prompt_tokens;
 const output=usage?.output_tokens??usage?.completion_tokens;
 if(!Number.isSafeInteger(input)||input<0||!Number.isSafeInteger(output)||output<0||
  !positive(prices?.inputNanoUsdPerToken)||!positive(prices?.outputNanoUsdPerToken))return null;
 const cost=input*prices.inputNanoUsdPerToken+output*prices.outputNanoUsdPerToken;
 return Number.isSafeInteger(cost)?cost:null;
}
module.exports={groqPlan,paidCapacityPolicy,estimateGroqNanoUsd};
