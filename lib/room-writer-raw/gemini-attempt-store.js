'use strict';
const {hash}=require('./source');
const PREFIX='urenavi-gemini-comparison-20261113';
function create(blob,{namespace=PREFIX}={}){
 if(namespace!==PREFIX&&!/^urenavi-gemini-comparison-20261113\/storage-probes\/[a-f0-9]{40}$/.test(namespace)&&!/^urenavi-gemini-comparison-20261113\/independent\/[a-f0-9]{64}$/.test(namespace))throw Error('gemini_storage_namespace_invalid');
 const read=async name=>{const r=await blob.get(name,{access:'private',useCache:false});
  if(!r)return null;if(r.statusCode!==200||!r.stream)throw Error('gemini_audit_read_failed');return JSON.parse(await new Response(r.stream).text());};
 const put=async(name,value)=>{const uploaded=await blob.put(name,JSON.stringify(value),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json',cacheControlMaxAge:60});
  if(hash(await read(name))!==hash(value))throw Error('gemini_audit_readback_failed');return uploaded;};
 function scopeKey(scope){if(!scope||typeof scope.itemCode!=='string'||typeof scope.model!=='string'||!/^[a-f0-9]{64}$/.test(scope.requestHash||''))throw Error('gemini_scope_invalid');return hash([scope.itemCode,scope.model,scope.requestHash]);}
 const base=scope=>namespace+'/requests/'+scopeKey(scope);
 return {
  // One immutable approval claim as well as a request scope: changing the model
  // or body cannot silently replenish the one-call grant.
  async begin(record){
   await put(namespace+'/approval.storage-bench-20261113-one-call.json',record);
   return put(base(record)+'/claim.json',{...record,state:'reserved_no_dispatch_receipt_yet',tokens:null});
  },
  async dispatch(scope,record){await put(base(scope)+'/dispatch.json',record);},
  async finish(scope,record){await put(base(scope)+'/result.json',record);},
  async state(scope){
   const [claim,dispatch,result,approvalClaim,legacyClaim,legacyResult]=await Promise.all([
    read(base(scope)+'/claim.json'),read(base(scope)+'/dispatch.json'),read(base(scope)+'/result.json'),read(namespace+'/approval.storage-bench-20261113-one-call.json'),
    namespace===PREFIX?read(PREFIX+'/initial.claim.json'):null,namespace===PREFIX?read(PREFIX+'/initial.result.json'):null]);
   return {claim,dispatch,result,approvalClaim,legacy:namespace===PREFIX?{claim:legacyClaim,result:legacyResult}:null};
  },
  async readProbe(name){if(!/^[a-f0-9]{40}$/.test(name))throw Error('gemini_probe_id_invalid');return read(PREFIX+'/storage-probes/'+name+'/proof.json');},
  async saveProof(value){if(!namespace.includes('/storage-probes/'))throw Error('gemini_probe_scope_required');await put(namespace+'/proof.json',value);},
  async readProof(){return read(namespace+'/proof.json');}
 };
}
function createIndependent(blob,grant,scope,{now=Date.now(),readOnly=false}={}){
 const gate=require('./gemini-execution-grant').assess(grant,scope,now,{readOnly});
 if(!gate.allow)throw Error('gemini_independent_grant_not_approved');
 const store=create(blob,{namespace:gate.namespace});
 return {...store,async dispatch(...args){if(readOnly)throw Error('gemini_read_only_store');return store.dispatch(...args);},async finish(...args){if(readOnly)throw Error('gemini_read_only_store');return store.finish(...args);},async begin(record){
  if(readOnly)throw Error('gemini_read_only_store');
  if(['itemCode','model','requestHash'].some(k=>record[k]!==scope[k]))throw Error('gemini_independent_scope_mismatch');
  const approval={approvalId:grant.approvalId,executionId:grant.executionId,approvedBy:grant.approvedBy,approvedAt:grant.approvedAt,scope,maxCalls:1,priorClassification:'D'};
  await blob.put(gate.approvalPath,JSON.stringify(approval),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json',cacheControlMaxAge:60});
  const r=await blob.get(gate.approvalPath,{access:'private',useCache:false});
  if(!r||r.statusCode!==200||!r.stream||hash(JSON.parse(await new Response(r.stream).text()))!==hash(approval))throw Error('gemini_independent_approval_readback_failed');
  return store.begin({...record,approvalId:grant.approvalId,executionId:grant.executionId});
 },async state(s){const [state,r]=await Promise.all([store.state(s),blob.get(gate.approvalPath,{access:'private',useCache:false})]);
  if(r&&(r.statusCode!==200||!r.stream))throw Error('gemini_independent_approval_read_failed');
  return {...state,approvalClaim:r?JSON.parse(await new Response(r.stream).text()):null};
 }};
}
module.exports={PREFIX,create,createIndependent};
