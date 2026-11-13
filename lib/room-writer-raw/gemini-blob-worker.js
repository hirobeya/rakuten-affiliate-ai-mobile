'use strict';
// One isolated SDK operation. Retry configuration cannot alter Groq's process.
process.env.VERCEL_BLOB_RETRIES='0';
process.once('message',async ({operation,name,value,timeoutMs})=>{
 try{
  const blob=require('@vercel/blob');const abortSignal=AbortSignal.timeout(timeoutMs);
  if(operation==='put'){
   const r=await blob.put(name,JSON.stringify(value),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json',cacheControlMaxAge:60,abortSignal});
   process.send({ok:true,value:{etag:r.etag,url:r.url}});
  }else if(operation==='get'){
   const r=await blob.get(name,{access:'private',useCache:false,abortSignal});
   if(!r)process.send({ok:true,value:null});
   else if(r.statusCode!==200||!r.stream)throw Error('read_failed');
   else process.send({ok:true,value:{statusCode:200,text:await new Response(r.stream).text()}});
  }else throw Error('operation_invalid');
 }catch(e){const error=e?.name==='BlobAlreadyExistsError'?'already_exists':e?.name==='BlobRequestAbortedError'?'storage_timeout':/oidc|token.*(?:missing|not|available)/i.test(e?.message||'')?'oidc_or_credential_unavailable':e?.name==='BlobAccessError'?'storage_access_denied':'storage_operation_failed';process.send({ok:false,error,operation,errorName:/^[A-Za-z]{1,80}$/.test(e?.name||'')?e.name:'Error'});}
 finally{process.disconnect();}
});
