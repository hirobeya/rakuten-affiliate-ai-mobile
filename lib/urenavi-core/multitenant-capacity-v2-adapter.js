'use strict';
const {resolveCapacityIdentity}=require('./multitenant-paid-identity');
const {attemptId}=require('./multitenant-protected-provider');

// Offline integration seam. The caller must inject a service-role client
// for the intended database; this module has no provider transport.
function createCapacityV2({db,authenticateSearchUser}={}){
 if(typeof db!=='function')throw Error('capacity_db_required');
 async function rpc(action,args){
  try{
   const prefix=action.startsWith('self_budget_')?'rpc/urenavi_':'rpc/urenavi_capacity_';
   return await db(prefix+action+'_v2',{method:'POST',body:JSON.stringify(args)})===true;
  }
  catch{return false;}
 }
 return {async reserve({req,authorization,model,item,stage,state,estimate,comparison}){
  const identity=await resolveCapacityIdentity(req,authorization,{authenticateSearchUser});
  if(!identity.ok||model!=='openai/gpt-oss-120b'||!Number.isSafeInteger(estimate)||estimate<1||estimate>1000000000)
   return null;
  const tenant=identity.user.id;
  const id=comparison?.attemptId??attemptId({userId:tenant,model,item,stage,state});
  const selfBudget=comparison?.budgetSource==='self_ledger';
  if(comparison?.budgetSource&&!['self_ledger'].includes(comparison.budgetSource))return null;
  if(comparison&&(!/^[a-f0-9-]{36}$/.test(id||'')||!comparison.verifiedAt||
    (!selfBudget&&!comparison.counters)||!comparison.evidenceHash))return null;
  if(!id)return null;
  const keys={p_id:id,p_tenant:tenant};
  if(!await rpc(selfBudget?'self_budget_reserve':'reserve',selfBudget?
    {...keys,p_estimate:estimate}:{...keys,p_provider:'groq',p_estimate:estimate}))return null;
  let stateOfAttempt='reserved';
  return {
   async markSendIntent(){
    if(stateOfAttempt!=='reserved')return false;
    stateOfAttempt='held';
    const accepted=selfBudget?await rpc('self_budget_intent',keys):comparison?await rpc('comparison_intent',{
     ...keys,p_verified_at:comparison.verifiedAt,p_counters:comparison.counters,p_evidence_hash:comparison.evidenceHash
    }):await rpc('intent',keys);
    if(!accepted)return false;
    stateOfAttempt='sent';
    return true;
   },
   async settle({status,actualTokens}={}){
    if(stateOfAttempt!=='sent')return false;
    stateOfAttempt='held';
    const known=Number.isSafeInteger(actualTokens)&&actualTokens>=0&&actualTokens<=1000000000;
    const outcome=status===429?'rate_limited':status===200&&known?'spent':'unknown';
    return rpc(selfBudget?'self_budget_complete':'complete',
      {...keys,p_outcome:outcome,p_actual:outcome==='spent'?actualTokens:null});
   }
  };
 }};
}
module.exports={createCapacityV2};
