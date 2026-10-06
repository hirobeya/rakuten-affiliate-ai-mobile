(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RoomPreviewRequest=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 async function run(item,{headers={'Content-Type':'application/json'},signal,isCurrent=()=>true,onPending=()=>{},onStage=()=>{},fetchImpl=fetch,waitImpl=null}={}){
  const active=()=>!signal?.aborted&&isCurrent();
  const cancelled=()=>{const e=new Error('Generation cancelled');e.name='AbortError';return e;};
  if(!active())throw cancelled();
  const response=await fetchImpl('/api/room-ai-v3',{method:'POST',headers,credentials:'include',signal,body:JSON.stringify(item)});
  const data=await response.json().catch(()=>({}));
  if(!active())throw cancelled();
  if(data?.phase)onStage(data.phase);
  // The active V3 Preview contract is single-request. 202/429 are returned to the caller
  // as explicit incomplete/failure states; this client never schedules or polls another AI call.
  return {status:response.status,data};
 }
 return {run};
});
