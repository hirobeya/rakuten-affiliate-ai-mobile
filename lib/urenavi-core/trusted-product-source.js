'use strict';
const C=require('./contracts');
const {boundedSource}=require('../product-source');
const {identity}=require('../../public/room-outcomes');
const PREFIX='urenavi-core-original-source-v1';
function pathname({owner,itemCode}){
 if(typeof owner!=='string'||!owner||typeof itemCode!=='string'||!itemCode)throw Error('original_source_identity_required');
 return PREFIX+'/'+C.hash({owner})+'/'+C.hash({itemCode})+'.json';
}
function privateReader(blob){
 if(typeof blob?.get!=='function')throw Error('private_original_reader_required');
 return async query=>{
  const r=await blob.get(pathname(query),{access:'private',useCache:false});
  if(!r||r.statusCode===404)return null;
  if(r.statusCode!==200||!r.stream)throw Error('original_source_unavailable');
  return JSON.parse(await new Response(r.stream).text());
 };
}
function create({loadSource}){
 if(typeof loadSource!=='function')throw Error('trusted_original_loader_required');
 return async ({authorization,item})=>{
  const owner=String(authorization?.user?.id||authorization?.user?.email||'').trim();
  if(authorization?.ok!==true||authorization.plan!=='owner'||!owner)throw Error('original_owner_required');
  const selected=C.source(item);
  if(!selected.itemCode)throw Error('original_product_identity_required');
  const envelope=await loadSource({owner,itemCode:selected.itemCode});
  if(!envelope)throw Error('original_source_missing');
  if(envelope.owner!==owner||envelope.provenance!=='rakuten-api')throw Error('original_source_untrusted');
  const source=C.source(envelope.source);
  if(source.itemCode!==selected.itemCode||envelope.sourceHash!==C.hash(source)||envelope.productIdentity!==identity(source))throw Error('original_source_mismatch');
  const displayed={...source,itemCaption:boundedSource(source.itemCaption,12000),catchcopy:boundedSource(source.catchcopy,500)};
  if(C.hash(displayed)!==C.hash(selected))throw Error('selected_product_mismatch');
  return structuredClone(source);
 };
}
module.exports={create,privateReader,pathname,PREFIX};
