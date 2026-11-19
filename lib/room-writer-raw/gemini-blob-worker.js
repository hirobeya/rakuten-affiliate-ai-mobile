'use strict';
// One isolated SDK operation. Retry configuration cannot alter Groq's process.
process.env.VERCEL_BLOB_RETRIES='0';
process.once('message',async ({operation,name,value,timeoutMs})=>{
 const started=Date.now();let sdkAt=null,bodyAt=null;process.send({phase:'ready'});
 const timings=()=>({sdkModuleMs:sdkAt===null?null:sdkAt-started,sdkRequestMs:sdkAt===null?null:(bodyAt??Date.now())-sdkAt,bodyReadMs:bodyAt===null?null:Date.now()-bodyAt});
 try{
  const blob=require('@vercel/blob');sdkAt=Date.now();const abortSignal=AbortSignal.timeout(timeoutMs);
  if(operation==='put'){
   const r=await blob.put(name,JSON.stringify(value),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json',cacheControlMaxAge:60,abortSignal});
   process.send({ok:true,value:{etag:r.etag,url:r.url},timings:timings()});
  }else if(operation==='get'){
   const r=await blob.get(name,{access:'private',useCache:false,abortSignal});
   bodyAt=Date.now();
   if(!r)process.send({ok:true,value:null,timings:timings()});
   else if(r.statusCode!==200||!r.stream)throw Error('read_failed');
   else process.send({ok:true,value:{statusCode:200,text:await new Response(r.stream).text()},timings:timings()});
  }else throw Error('operation_invalid');
 }catch(e){const error=(e?.name==='BlobAlreadyExistsError'||/already exists/i.test(e?.message||''))?'already_exists':e?.name==='BlobRequestAbortedError'?'storage_timeout':/oidc|token.*(?:missing|not|available)/i.test(e?.message||'')?'oidc_or_credential_unavailable':e?.name==='BlobAccessError'?'storage_access_denied':'storage_operation_failed';process.send({ok:false,error,operation,errorName:/^[A-Za-z]{1,80}$/.test(e?.name||'')?e.name:'Error',timings:timings()});}
 finally{process.disconnect();}
});
