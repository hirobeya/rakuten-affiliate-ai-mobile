'use strict';
const {fork}=require('node:child_process');const path=require('node:path');
const PREFIX='urenavi-gemini-comparison-20261113/';
function sdk({timeoutMs=7000,oidcToken=null,onObservation=()=>{},forkImpl=fork}={}){
 if(forkImpl===fork)require.resolve('@vercel/blob'); // Traced for deployment, not loaded by offline mocks.
 function operation(operation,name,value){
  if(typeof name!=='string'||!name.startsWith(PREFIX)||name.includes('..'))return Promise.reject(Error('gemini_storage_scope_rejected'));
  return new Promise((resolve,reject)=>{
   const started=Date.now();let readyAt=null;
   const child=forkImpl(path.join(__dirname,'gemini-blob-worker.js'),[],{stdio:['ignore','ignore','ignore','ipc'],env:{...process.env,VERCEL_BLOB_RETRIES:'0',...(typeof oidcToken==='string'&&oidcToken?{VERCEL_OIDC_TOKEN:oidcToken}:{})}});
   let done=false;const finish=(err,v)=>{if(done)return;done=true;clearTimeout(timer);child.kill();try{onObservation({operation,outcome:err?'failed':'completed',elapsedMs:Date.now()-started,workerStartupMs:readyAt===null?null:readyAt-started,phase:err?(readyAt===null?'worker_startup':'sdk_or_readback'):'completed',...(err?{code:err.message}:{}),...(v?.timings||{})});}catch{}if(err)reject(err);else resolve(v);};
   const timer=setTimeout(()=>finish(Error('gemini_storage_timeout')),timeoutMs+300);
   child.on('error',()=>finish(Error('gemini_storage_worker_failed')));
   child.on('exit',()=>finish(Error('gemini_storage_worker_stopped')));
   child.on('message',r=>{if(r.phase==='ready'){readyAt=Date.now();return;}if(r.ok)finish(null,{payload:r.value,timings:r.timings});else{const e=Error('gemini_'+r.error);e.storageOperation=r.operation;e.storageErrorName=r.errorName;finish(e,{timings:r.timings});}});
   child.send({operation,name,value,timeoutMs});
  });
 }
 return {put:async(name,body)=>(await operation('put',name,JSON.parse(body))).payload,async get(name){const r=(await operation('get',name)).payload;return r?{statusCode:r.statusCode,stream:new Blob([r.text]).stream()}:null;}};
}
module.exports={sdk};
