'use strict';
const {fork}=require('node:child_process');const path=require('node:path');
const PREFIX='urenavi-gemini-comparison-20261113/';
function sdk({timeoutMs=7000,oidcToken=null}={}){
 require.resolve('@vercel/blob'); // Traced for deployment, not loaded by offline mocks.
 function operation(operation,name,value){
  if(typeof name!=='string'||!name.startsWith(PREFIX)||name.includes('..'))return Promise.reject(Error('gemini_storage_scope_rejected'));
  return new Promise((resolve,reject)=>{
   const child=fork(path.join(__dirname,'gemini-blob-worker.js'),[],{stdio:['ignore','ignore','ignore','ipc'],env:{...process.env,VERCEL_BLOB_RETRIES:'0',...(typeof oidcToken==='string'&&oidcToken?{VERCEL_OIDC_TOKEN:oidcToken}:{})}});
   let done=false;const finish=(err,v)=>{if(done)return;done=true;clearTimeout(timer);child.kill();if(err)reject(err);else resolve(v);};
   const timer=setTimeout(()=>finish(Error('gemini_storage_timeout')),timeoutMs+300);
   child.on('error',()=>finish(Error('gemini_storage_worker_failed')));
   child.on('exit',()=>finish(Error('gemini_storage_worker_stopped')));
   child.on('message',r=>{if(r.ok)finish(null,r.value);else{const e=Error('gemini_'+r.error);e.storageOperation=r.operation;e.storageErrorName=r.errorName;finish(e);}});
   child.send({operation,name,value,timeoutMs});
  });
 }
 return {put:(name,body)=>operation('put',name,JSON.parse(body)),async get(name){const r=await operation('get',name);return r?{statusCode:r.statusCode,stream:new Blob([r.text]).stream()}:null;}};
}
module.exports={sdk};
