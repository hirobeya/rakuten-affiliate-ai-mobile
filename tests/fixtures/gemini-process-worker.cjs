'use strict';
const fs=require('node:fs'),path=require('node:path'),{hash}=require('../../lib/room-writer-raw/source');
function blob(directory,{failResult=false}={}){return {
 async put(name,body,options){if(options.allowOverwrite!==false)throw Error('not_create_only');if(failResult&&name.endsWith('/result.json'))throw Error('mock_save_failed');const fd=fs.openSync(path.join(directory,hash(name)),'wx');try{fs.writeFileSync(fd,body);fs.fsyncSync(fd);}finally{fs.closeSync(fd);}return {};},
 async get(name){try{return {statusCode:200,stream:new Blob([fs.readFileSync(path.join(directory,hash(name)))]).stream()};}catch(e){if(e.code==='ENOENT')return null;throw e;}}
};}
module.exports={blob};
if(require.main===module)process.once('message',async({directory,grant,scope,phase})=>{
 try{
  const store=require('../../lib/room-writer-raw/gemini-attempt-store').createIndependent(blob(directory,{failResult:phase==='save-failure'}),grant,scope);
  await store.begin(scope);
  if(phase==='before-send'){process.send({stage:'claimed_before_dispatch',mockProviderCalls:0});setInterval(()=>{},1000);return;}
  await store.dispatch(scope,{state:'mock_dispatch_intent',tokens:null});
  fs.appendFileSync(path.join(directory,'mock-provider-count'),'mock-only\n');
  if(phase==='after-send'){process.send({stage:'mock_dispatched_result_unknown',mockProviderCalls:1});setInterval(()=>{},1000);return;}
  try{await store.finish(scope,{...scope,tokens:{input:2,output:3,total:5},mock:true});process.send({stage:'completed'});}catch{process.send({stage:'save_failed_no_retry'});}
 }catch{process.send({stage:'blocked'});}finally{if(!['before-send','after-send'].includes(phase))process.disconnect();}
});
