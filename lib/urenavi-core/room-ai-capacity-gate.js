'use strict';
// Runtime bridge for the single text-only Groq route. This does not create a
// separate provider, provider account, budget ledger, or send/retry queue.
// The trusted v2 Supabase RPCs remain the final source of dispatch authority.
const {createCapacityV2}=require('./multitenant-capacity-v2-adapter');
const {actualUsage}=require('./multitenant-attempt-id');
const MODEL='openai/gpt-oss-120b';
// Reserve the full documented minute Free ceiling rather than infer tokens.
// The atomic DB windows must verify the actual available capacity; unknown
// or stale evidence never authorizes a request.
const MAX_RESERVATION_TOKENS=8000;
function stop(reason){
 const error=new Error(reason);
 error.status=503;
 error.capacityPreDispatch=true;
 return error;
}
async function guardedRoomAiCall({
 req,authorization,item,apiKey,db,authenticateSearchUser,callAI,
 estimate=MAX_RESERVATION_TOKENS,model=MODEL
}={}){
 if(model!==MODEL || !apiKey || typeof db!=='function' ||
    typeof callAI!=='function' || !item?.itemCode || !item?.itemName ||
    typeof item.itemCaption!=='string' ||
    !Number.isSafeInteger(estimate)||estimate<=0||estimate>MAX_RESERVATION_TOKENS)
   throw stop('room_ai_capacity_gate_unavailable');
 // No frontend claim, client-controlled attempt index or stale session can
 // grant a send. The attempt ID is derived from server-verified paid identity.
 const capacity=createCapacityV2({db,authenticateSearchUser});
 const hold=await capacity.reserve({
  req,authorization,model,item,stage:'generate',state:{attempt:0},estimate
 });
 if(!hold)throw stop('room_ai_capacity_reservation_unconfirmed');
 if(!await hold.markSendIntent())throw stop('room_ai_send_intent_unconfirmed');
 let result,error;
 try{
  // A single text request. No retry, image or type-knowledge follow-up.
  result=await callAI({apiKey,model,itemName:item.itemName,
   itemCaption:item.itemCaption,itemPrice:item.itemPrice,
   imageDataUrl:null,maxRetries:0});
 }catch(e){error=e;}
 const tokens=error?null:actualUsage(result?.usage);
 let settled=false;
 try{settled=await hold.settle({
  status:error?.status===429?429:error?0:200,
  actualTokens:tokens
 });}catch{}
 if(!settled)throw stop('room_ai_settlement_unconfirmed_no_retry');
 if(error)throw error;
 if(tokens===null)throw stop('room_ai_provider_usage_unknown_no_retry');
 return result;
}
module.exports={guardedRoomAiCall,MODEL,MAX_RESERVATION_TOKENS};
