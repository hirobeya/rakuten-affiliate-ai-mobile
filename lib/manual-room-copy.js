'use strict';
const {authorize}=require('./billing');
const {localZeroCall,verifiedCaptionEditorialRescue,verifiedTitleSignalEditorialRescue}=require('../api/room-ai-v3');
const {provenLocalCopy}=require('./room-copy-handler');
const {compose:composePurchaseReason,hasStructuredReason}=require('./manual-purchase-reason');
const {composeSourceCopy}=require('./urenavi-core/source-purchase-relations');
const {naturalizedCopy,hasMalformedTopicChain}=require('./room-copy-naturalization');

function createHandler({authorizeUser=authorize}={}){
 return async (req,res)=>{
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({message:'method_not_allowed'});
  const preview=process.env.VERCEL_ENV==='preview';
  if(!preview&&(process.env.VERCEL_ENV!=='production'||process.env.URENAVI_PRODUCT_INPUT_MODE!=='manual'))
   return res.status(404).json({message:'manual_input_unavailable'});
  let auth;
  try{auth=await authorizeUser(req);}catch{return res.status(503).json({message:'authorization_unavailable'});}
  if(!auth?.ok||!(preview?['owner']:['owner','base','pro']).includes(auth.plan))
   return res.status(403).json({message:'access_required'});
  const {name,features,description,price}=req.body||{};
  if(typeof name!=='string'||!name.trim()||name.length>250
    ||typeof features!=='string'||features.length>2000
    ||typeof description!=='string'||description.length>4000
    ||(!features.trim()&&!description.trim())
    ||(price!=null&&(!Number.isSafeInteger(price)||price<1||price>100000000)))
   return res.status(400).json({message:'invalid_product_input'});
  const item={itemName:name.trim(),itemCaption:[features.trim(),description.trim()].filter(Boolean).join('\n'),itemPrice:price??0};
  const result=generate(item);
  if(!result)return res.status(422).json({message:'source_verified_copy_unavailable'});
  return res.status(200).json({text:result.text});
 };
}

function generate(item){
  const composed=composePurchaseReason(item);
  if(composed)return {text:composed.text,path:'source_relation'};
  const blockedLegacy=hasStructuredReason(item);
  if(blockedLegacy){
   const linked=composeSourceCopy(item,item.itemName.trim(),{inputOwner:true});
   return linked?{text:linked.text,path:'linked_source_relation'}:null;
  }
  const base=localZeroCall(item);
  let accepted=provenLocalCopy(item,base)?base:null;
  const diagnostics={};
  if(!accepted){
   const editorial=localZeroCall(item,'',diagnostics,{editorial:true,linkedReason:true,identityExpansion:true,verifiedIntent:true});
   if((verifiedCaptionEditorialRescue(item,editorial)||verifiedTitleSignalEditorialRescue(item,editorial))
    &&provenLocalCopy(item,editorial))accepted=editorial;
  }
  if(accepted){
   const text=naturalizedCopy(item,accepted).quality.text;
   if(!hasMalformedTopicChain(text)&&!/(?:^|[。、\n])\s*より(?:長持ち|速く|高い|少ない)/u.test(text))
    return {text,path:'verified_local'};
  }
  if(diagnostics.stage==='identity'&&diagnostics.reason==='competing_identity')return null;
  const title=item.itemName.trim();
  const type=diagnostics.identity;
  // The resolver can compact words from a title. Source spans require a
  // contiguous literal mention, so use the agreed canonical type if needed.
  const {rule,literal}=diagnostics.identityCandidates||{};
  const agreedType=rule&&rule===literal?rule:null;
  const identities=[type,agreedType,title].filter((value,index,all)=>value&&title.includes(value)&&all.indexOf(value)===index);
  for(const identity of identities){
   const linked=composeSourceCopy(item,identity,{inputOwner:title.length<=42});
   if(linked)return {text:linked.text,path:'linked_source_relation'};
  }
  return null;
}
module.exports=createHandler();
module.exports.createHandler=createHandler;
module.exports.generate=generate;
