'use strict';
const R=require('../../../../lib/urenavi-core/last-resort');
function create(env=process.env){return function(req,res){
 res.setHeader('Cache-Control','no-store');
 if(env.VERCEL_ENV!=='preview'||env.VERCEL_GIT_COMMIT_REF!=='rebuild/urenavi-core-20261028')return res.status(403).json({status:'isolated_preview_required',inferenceEnabled:false});
 if(req.method==='GET')return res.status(200).json({status:'local_first_evaluation',sourceSha:env.VERCEL_GIT_COMMIT_SHA||null,inferenceEnabled:false,publication:false,copyable:false});
 if(req.method!=='POST')return res.status(405).json({status:'method_not_allowed'});
 const b=req.body;
 if(!b||typeof b!=='object'||Array.isArray(b)||Object.keys(b).some(k=>!['item','mode'].includes(k))||Buffer.byteLength(JSON.stringify(b))>65536||!b.item||typeof b.item.itemName!=='string'||typeof b.item.itemCaption!=='string'||!['normal','batch'].includes(b.mode||'normal'))return res.status(400).json({status:'invalid_input'});
 // Only original product fields. Posted permissions, reviews, scores, URLs,
 // execution flags and learned identity cannot change this route.
 const item=Object.fromEntries(['itemCode','itemName','itemCaption','catchcopy','itemPrice'].map(k=>[k,b.item[k]]));
 if(Object.keys(b.item).some(k=>!Object.hasOwn(item,k))||[item.itemCode,item.catchcopy].some(v=>v!==undefined&&typeof v!=='string')||(item.itemPrice!==undefined&&(!Number.isFinite(item.itemPrice)||item.itemPrice<0)))return res.status(400).json({status:'invalid_input'});
 try{const r=R.generate(item,{mode:b.mode||'normal'});return res.status(200).json({status:r.result?'candidate_for_editorial_review':'incomplete',sourceSha:env.VERCEL_GIT_COMMIT_SHA||null,text:r.result?.quality.text||'',diagnostic:r.diagnostic,localStatus:r.localStatus,qualityCertified:false,inferenceEnabled:false,groqCalls:0,apiCost:0,publication:false,copyable:false});}catch{return res.status(400).json({status:'local_evaluation_failed',inferenceEnabled:false,publication:false});}
};}
module.exports=create();module.exports.create=create;
