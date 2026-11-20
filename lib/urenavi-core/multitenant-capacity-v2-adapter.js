'use strict';
const {resolveCapacityIdentity}=require('./multitenant-paid-identity');
const {attemptId}=require('./multitenant-protected-provider');

// Offline integration seam. The caller must inject a service-role client
// for the intended database; this module has no provider transport.
function createCapacityV2({db,authenticateSearchUser}={}){
 if(typeof db!=='function')throw Error('capacity_db_required');
 async function rpc(action,args){
  try{return await db('rpc/urenavi_capacity_'+action+'_v2',{method:'POST',body:JSON.stringify(args)})===true;}
  catch{return false;}
 }
 return {async reserve({req,authorization,model,item,stage,state,estimate,comparison}){
  const identity=await resolveCapacityIdentity(req,authorization,{authenticateSearchUser});
  if(!identity.ok||model!=='openai/gpt-oss-120b'||!Number.isSafeInteger(estimate)||estimate<1||estimate>1000000000)
   return null;
  const tenant=identity.user.id;
  const id=comparison?.attemptId??attemptId({userId:tenant,model,item,stage,state});
  if(comparison&&(!/^[a-f0-9-]{36}$/.test(id||'')||!comparison.verifiedAt||!comparison.counters||!comparison.evidenceHash))return null;
  if(!id)return null;
  const keys={p_id:id,p_tenant:tenant};
  if(!await rpc('reserve',{...keys,p_provider:'groq',p_estimate:estimate}))return null;
  let stateOfAttempt='reserved';
  return {
   async markSendIntent(){
    if(stateOfAttempt!=='reserved')return false;
    stateOfAttempt='held';
    const accepted=comparison?await rpc('comparison_intent',{
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
    return rpc('complete',{...keys,p_outcome:outcome,p_actual:outcome==='spent'?actualTokens:null});
   }
  };
 }};
}
module.exports={createCapacityV2};
