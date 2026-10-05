(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RoomPreviewRequest=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 async function run(item,{headers={'Content-Type':'application/json'},signal,isCurrent=()=>true,onPending=()=>{},onStage=()=>{},onRequest=()=>{},fetchImpl=fetch,waitImpl=null}={}){
  const active=()=>!signal?.aborted&&isCurrent();
  const cancelled=()=>{const e=new Error('Generation cancelled');e.name='AbortError';return e;};
  const wait=waitImpl|| (async ms=>{const until=Date.now()+ms;while(Date.now()<until){if(!active())throw cancelled();await new Promise(r=>setTimeout(r,Math.min(1000,until-Date.now())));}});
  let requestCount=0;
  for(let step=0;step<32;step++){
   if(!active())throw cancelled();
   onRequest(++requestCount);
   const response=await fetchImpl('/api/room-ai-v3',{method:'POST',headers,credentials:'include',signal,body:JSON.stringify(item)});
   const data=await response.json().catch(()=>({}));
   if(response.status!==202||data.pending!==true)return {status:response.status,data,requestCount};
   if(step===31)throw new Error('Preview pipeline did not finish');
   onStage(data.phase);
   const delay=Number(data.retryAfterMs);
   if(!Number.isFinite(delay)||delay<0||delay>120000)throw new Error('Invalid Preview retry interval');
   onPending(delay,data.phase);if(delay>0)await wait(delay+250);
  }
 }
 return {run};
});
