'use strict';
const {createHash}=require('node:crypto');
const {catalogueOnly,restatedReason}=require('../../public/purchase-copy-quality');
const {guardUnsupportedBenefitCopy}=require('../../public/fact-safety');

const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
function roomCopySourceHash(item){
 return digest([item.itemCode,item.itemName,item.itemCaption,item.itemPrice]);
}
function reviewDigest(item,raw){
 const product=raw?.productType;
 const claims=entries=>entries.map(({source,text,evidence})=>[source,text,evidence]);
 return digest(['groq-room-review-v1',roomCopySourceHash(item),raw.roomCopy,
  [product?.source,product?.value,product?.evidence],claims(raw.features),claims(raw.sellingPoints),raw.confidence]);
}
function reviewedRoomCopy(item,record,validation,text,env=process.env){
 const raw=record?.raw;
 if(record?.sourceHash!==roomCopySourceHash(item)||!raw||validation?.mode!=='simple'
  ||validation.productType?.valid!==true||!Array.isArray(raw.features)||!Array.isArray(raw.sellingPoints))return false;
 const claims=[...raw.features,...raw.sellingPoints], checked=[...validation.features,...validation.sellingPoints];
 if(claims.length<1||claims.length>5||claims.length!==checked.length||
  !checked.every(claim=>claim.valid===true)||
  !claims.every(claim=>['itemCaption','itemName'].includes(claim?.source)&&
   typeof claim.text==='string'&&claim.text===claim.evidence&&claim.text.trim()&&item[claim.source].includes(claim.text)))return false;
 if(!['itemName','itemCaption'].includes(raw.productType?.source)||
  raw.productType.value!==raw.productType.evidence||!item[raw.productType.source].includes(raw.productType.value))return false;
 if(/[<>]/u.test(text)||catalogueOnly(text)||restatedReason(text,{identity:validation.productType.value})
  ||guardUnsupportedBenefitCopy(item,text)!==text)return false;
 try{
  // Only the operator environment can record a completed human review.
  // The digest binds exact prose, evidence, listing text and price.
  const approvals=JSON.parse(env.URENAVI_ROOM_COPY_REVIEWED_HASHES||'[]');
  return Array.isArray(approvals)&&approvals.includes(reviewDigest(item,raw));
 }catch{return false;}
}
module.exports={roomCopySourceHash,reviewDigest,reviewedRoomCopy};
