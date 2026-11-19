'use strict';
// Preview-only integration adapter; must never be used as an implicit dispatch grant.
// Server auth, server quota snapshot, and service-role RPC are independently injected.
const crypto=require('node:crypto');
const {reserve}=require('./multitenant-reservation-adapter');
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const rpcOk=(value,key)=>value?.[key]===true;
function attemptId({userId,model,item,stage,state}){
  // Stable across reconnects/uncertain save; never sourced from client. Same
  // user/product/stage/attempt can't get a second provider dispatch.
  if(!UUID.test(String(userId||'')) || !['generate','verify'].includes(stage))return null;
  if(!Number.isSafeInteger(state?.attempt)||state.attempt<0||state.attempt>3)return null;
  const payload=JSON.stringify(['urenavi-capacity-v1',userId,model,
    item?.itemCode,item?.itemName,item?.itemCaption,item?.catchcopy||'',stage,state.attempt]);
  if(!item?.itemCode || !item?.itemName || typeof item?.itemCaption!=='string')return null;
  const hex=crypto.createHash('sha256').update(payload).digest('hex');
  return [hex.slice(0,8),hex.slice(8,12),'4'+hex.slice(13,16),
    '8'+hex.slice(17,20),hex.slice(20,32)].join('-');
}
function halted(code){
 const e=new Error(code);e.status=503;e.stage='capacity';return e;
}
function actualUsage(usage){
 // Missing or ambiguous counts must NOT be used to settle a known spend.
 const input=usage?.prompt_tokens??usage?.input_tokens;
 const output=usage?.completion_tokens??usage?.output_tokens;
 return Number.isSafeInteger(input)&&input>=0&&Number.isSafeInteger(output)&&output>=0?input+output:null;
}
function protectProvider(provider,{identity,dbRpc,capacityForStage,item}={}){
 if(!provider||typeof provider.call!=='function'||typeof provider.requiredTokens!=='function')
  throw halted('provider_contract_missing');
 const original=provider;
 return {
  model:original.model,
  requiredTokens:(...args)=>original.requiredTokens(...args),
  async call(stage,source,state){
   // Default-deny even on injected provider: exact verified user ID required.
   const userId=identity?.user?.id;
   const id=attemptId({userId,model:original.model,item:source,stage,state});
   if(!id||identity.ok!==true||!['owner','base','pro'].includes(identity.plan)
      ||typeof dbRpc!=='function'||typeof capacityForStage!=='function')
    throw halted('capacity_identity_or_backend_unavailable');
   const estimate=original.requiredTokens(stage,source,state);
   let snapshot;
   try{snapshot=await capacityForStage({userId,stage,estimate,model:original.model});}
   catch{throw halted('capacity_snapshot_unavailable');}
   const reserved=await reserve({
    authorize:async()=>identity,dbRpc,request:{serverAttemptId:id},
    capacity:{...snapshot,estimate:{requests:1,tokens:estimate}}
   });
   if(!reserved.reserved)throw halted(reserved.reason);
   let intent;
   try{intent=await dbRpc('urenavi_capacity_send_intent_v1',{p_attempt_id:id,p_user_id:userId});}
   catch{throw halted('send_intent_unknown_no_retry');}
   if(!rpcOk(intent,'accepted')||intent.attemptId!==id||intent.userId!==userId)
    throw halted('send_intent_not_confirmed');
   let result,error;
   try{result=await original.call(stage,source,state);}catch(e){error=e;}
   // Once intent is durable, even 429/503/timeout may have consumed tokens.
   const tokens=error?null:actualUsage(result?.usage);
   const outcome=error||tokens===null?'outcome_unknown':'spent';
   try {
    const settled=await dbRpc('urenavi_capacity_complete_v1',{
      p_attempt_id:id,p_user_id:userId,p_outcome:outcome,p_actual_tokens:tokens
    });
    if(!rpcOk(settled,'accepted')||settled.attemptId!==id||settled.status!==outcome)
      throw Error('not_settled');
   } catch {
    throw halted('provider_outcome_persistence_unconfirmed_no_retry');
   }
   if(error)throw error;
   if(outcome!=='spent')throw halted('provider_usage_unknown_no_retry');
   return result;
  }
 };
}
module.exports={protectProvider,attemptId,actualUsage};
