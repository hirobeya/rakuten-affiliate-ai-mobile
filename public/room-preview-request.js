(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RoomPreviewRequest=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 async function run(item,{headers={'Content-Type':'application/json'},signal,isCurrent=()=>true,onPending=()=>{},onStage=()=>{},onRequest=()=>{},onResponse=()=>{},waitForRateLimit=false,notBefore=0,fetchImpl=fetch,waitImpl=null}={}){
  const active=()=>!signal?.aborted&&isCurrent();
  const cancelled=()=>{const e=new Error('Generation cancelled');e.name='AbortError';return e;};
  const wait=waitImpl|| (async ms=>{const until=Date.now()+ms;while(Date.now()<until){if(!active())throw cancelled();await new Promise(r=>setTimeout(r,Math.min(1000,until-Date.now())));}});
  let requestCount=0,llmCallCount=0;
  const initialDelay=Number(notBefore)-Date.now();
  if(initialDelay>0&&initialDelay<=86400000){onPending(initialDelay,'rate_limit');await wait(initialDelay+250);}
  for(let step=0;step<32;step++){
   if(!active())throw cancelled();
   onRequest(++requestCount);
   const response=await fetchImpl('/api/room-ai-v3',{method:'POST',headers,credentials:'include',signal,body:JSON.stringify(item)});
   const data=await response.json().catch(()=>({}));
   if(Number.isSafeInteger(data.requestLlmCalls)&&data.requestLlmCalls>=0)llmCallCount+=data.requestLlmCalls;
   onResponse({status:response.status,data,requestCount,llmCallCount});
   const delay=Number(data.retryAfterMs);
   const limited=waitForRateLimit&&response.status===429&&data.rateLimitDiagnostic?.source==='upstream'&&Number.isFinite(delay)&&delay>0&&delay<=86400000;
   if(!limited&&(response.status!==202||data.pending!==true))return {status:response.status,data,requestCount,llmCallCount};
   if(step===31)throw new Error('Preview pipeline did not finish');
   onStage(limited?'rate_limit':data.phase);
   if(!Number.isFinite(delay)||delay<0||(!limited&&delay>120000))throw new Error('Invalid Preview retry interval');
   onPending(delay,limited?'rate_limit':data.phase);if(delay>0)await wait(delay+250);
  }
 }
 return {run};
});
