'use strict';
const crypto=require('node:crypto');
const VERSION='raw-source-fallback-v1';
const TEXT_FIELDS=['itemName','itemCaption','catchcopy'];
const ATTRIBUTES=['genreId','itemUrl','shopName','shopCode','availability','postageFlag','taxFlag','creditCardFlag','affiliateRate','pointRate','startTime','endTime','itemUnit'];
const hash=value=>crypto.createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
function prepare(item){
 if(!item||typeof item!=='object'||Array.isArray(item))throw Error('raw_source_invalid');
 if(typeof item.itemCode!=='string'||!item.itemCode.trim()||TEXT_FIELDS.some(k=>typeof item[k]!=='string')||!item.itemName.trim()||!item.itemCaption.trim())throw Error('raw_source_fields_required');
 if(!Number.isFinite(item.itemPrice)||item.itemPrice<0)throw Error('raw_source_price_invalid');
 const source=Object.fromEntries(['itemCode',...TEXT_FIELDS,'itemPrice'].map(k=>[k,item[k]]));
 for(const k of ATTRIBUTES)if(Object.hasOwn(item,k)){
  if(!['string','number','boolean'].includes(typeof item[k])||typeof item[k]==='number'&&!Number.isFinite(item[k]))throw Error('raw_source_attribute_invalid');
  source[k]=item[k];
 }
 // No HTML stripping, Unicode normalization, whitespace folding, split, or summary.
 const serialized=JSON.stringify(source),bytes=Buffer.byteLength(serialized);
 return freeze({version:VERSION,source,sourceHash:hash(source),fieldHashes:Object.fromEntries(Object.entries(source).map(([k,v])=>[k,hash(JSON.stringify(v))])),
  formattingHistory:[{operation:'json_serialization',lossless:true,semanticTextChanged:false}],
  excludedAttributes:Object.keys(item).filter(k=>!Object.hasOwn(source,k)),bytes,
  held:bytes>18000,reason:bytes>18000?'raw_source_too_long_no_truncation':null});
}
function intact(envelope){return envelope?.version===VERSION&&hash(envelope.source)===envelope.sourceHash&&Object.entries(envelope.source).every(([k,v])=>hash(JSON.stringify(v))===envelope.fieldHashes[k]);}
module.exports={VERSION,TEXT_FIELDS,ATTRIBUTES,hash,freeze,prepare,intact};
