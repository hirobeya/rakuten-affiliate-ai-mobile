'use strict';
// Independent namespace. Never reads or writes Groq reservations or evidence.
const PREFIX='urenavi-gemini-comparison-20261113';
function create(blob){
 const read=async name=>{const r=await blob.get(name,{access:'private',useCache:false});
  if(!r)return null;if(r.statusCode!==200||!r.stream)throw Error('gemini_audit_read_failed');
  return JSON.parse(await new Response(r.stream).text());};
 const put=async(name,value)=>{
  await blob.put(name,JSON.stringify(value),{access:'private',addRandomSuffix:false,allowOverwrite:false,contentType:'application/json',cacheControlMaxAge:60});
  if(JSON.stringify(await read(name))!==JSON.stringify(value))throw Error('gemini_audit_readback_failed');
 };
 return {
  // A single create-only global claim enforces the current one-call grant across
  // products, owners, cold starts, deployments and concurrent requests. Never reset.
  async begin(record){await put(PREFIX+'/initial.claim.json',{...record,state:'attempt_reserved_consumption_unknown'});},
  async finish(record){await put(PREFIX+'/initial.result.json',record);},
  async state(){return {claim:await read(PREFIX+'/initial.claim.json'),result:await read(PREFIX+'/initial.result.json')};}
 };
}
module.exports={PREFIX,create};
