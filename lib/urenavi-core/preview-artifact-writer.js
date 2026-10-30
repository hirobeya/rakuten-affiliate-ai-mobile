'use strict';
const C=require('./contracts'),Source=require('./trusted-product-source'),Completed=require('./authenticated-completed-read'),Bridge=require('./app-bridge');
const {identity}=require('../../public/room-outcomes');
function create({blob,assertWriteAllowed}={}){
 if(typeof blob?.get!=='function'||typeof blob?.put!=='function'||typeof assertWriteAllowed!=='function')throw Error('preview_writer_dependencies_required');
 async function permit(auth){
  if(process.env.VERCEL_ENV!=='preview'||auth?.ok!==true||!auth.user?.id||await assertWriteAllowed(auth)!==true)throw Error('preview_write_not_authorized');
  return auth.user.id;
 }
 async function read(name){
  const r=await blob.get(name,{access:'private',useCache:false});
  if(!r||r.statusCode===404)return null;
  if(r.statusCode!==200||!r.stream||typeof r.blob?.etag!=='string')throw Error('preview_storage_unavailable');
  return {value:JSON.parse(await new Response(r.stream).text()),etag:r.blob.etag};
 }
 async function persist(name,value,{mutable=false}={}){
  const previous=await read(name);
  if(previous&&C.hash(previous.value)===C.hash(value))return {stored:false,reused:true};
  if(previous&&!mutable)throw Error('completed_artifact_conflict');
  const result=await blob.put(name,JSON.stringify(value),{access:'private',addRandomSuffix:false,allowOverwrite:!!previous,...(previous?{ifMatch:previous.etag}:{}),contentType:'application/json',cacheControlMaxAge:60});
  const confirmed=await read(name);
  if(!confirmed||typeof result.etag!=='string'||result.etag!==confirmed.etag||C.hash(value)!==C.hash(confirmed.value))throw Error('preview_save_unconfirmed');
  return {stored:true,reused:false};
 }
 async function captureSources({authorization,keyword,items}){
  const owner=await permit(authorization);
  if(typeof keyword!=='string'||!keyword||!Array.isArray(items))throw Error('search_sources_required');
  const values=items.map(item=>{const source=C.source(item);return {owner,provenance:'rakuten-api',source,sourceHash:C.hash(source),productIdentity:identity(source),searchKeyword:keyword};});
  if(new Set(values.map(v=>v.source.itemCode)).size!==values.length)throw Error('duplicate_search_identity');
  for(const value of values)await persist(Source.pathname({owner,itemCode:value.source.itemCode}),value,{mutable:true});
  return {count:values.length};
 }
 async function saveCompleted({authorization,artifact,conditions={},admission=null}){
  const owner=await permit(authorization),source=C.source(artifact?.source),sourceHash=C.hash(source);
  const original=await read(Source.pathname({owner,itemCode:source.itemCode}));
  if(original?.value?.owner!==owner||original.value.provenance!=='rakuten-api'||original.value.sourceHash!==sourceHash||C.hash(C.source(original.value.source))!==sourceHash||original.value.productIdentity!==identity(source))throw Error('completed_original_not_current');
  const envelope={owner,artifact:structuredClone(artifact)};
  const projected=await Bridge.create({loadCompleted:async()=>envelope})({environment:'preview',authorization,item:source,conditions,admission});
  if(!projected)throw Error('completed_publication_required');
  return persist(Completed.pathname({owner,key:artifact.key,version:artifact.version}),envelope);
 }
 return {captureSources,saveCompleted};
}
module.exports={create};
