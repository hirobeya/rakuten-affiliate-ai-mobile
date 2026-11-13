'use strict';
// Preview-only, owner-only comparison of four already committed public-source captures.
// No production app route references this endpoint; never uses user-supplied product text.
const {authorize}=require('../billing');
const {compareOnce, buildGeminiComparison}=require('./gemini-comparison');
// Static imports so Vercel's serverless file tracing bundles these four samples.
const ITEMS=Object.freeze({
  '3': require('../../docs/experiments/raw-source-fallback-20261111/acquisition-20261111/fresh-products/03.json').source,
  '4': require('../../docs/experiments/raw-source-fallback-20261111/acquisition-20261111/fresh-products/04.json').source,
  '5': require('../../docs/experiments/raw-source-fallback-20261111/acquisition-20261111/fresh-products/05.json').source,
  '6': require('../../docs/experiments/raw-source-fallback-20261111/acquisition-20261111/fresh-products/06.json').source
});
const EXPECTED_BRANCH='experiment/urenavi-gemini-comparison-20261113';
function reply(res,status,data){
  res.status(status).json(data);
}
function authorizedOrigin(req){
  const origin=String(req.headers?.origin||'');
  const host=String(req.headers?.host||'');
  if(!origin||!host)return false;
  try {return new URL(origin).origin==='https://'+host;}catch{return false;}
}
function loadItem(id){
  return Object.hasOwn(ITEMS,String(id)) ? ITEMS[String(id)] : null;
}
function flatten(draft){
  if(draft?.hold?.active || !draft?.post)return null;
  const sections=['sentences','notes','tags'].map(k=>(draft.post[k]||[]).map(x=>x.text).join(k==='tags'?' ':''));
  return [sections[0],sections[1],sections[2]].filter(Boolean).join('\n');
}
function citationsPresent(draft,item){
  if(!draft||!item)return false;
  const blocks=[...(draft.product?.basis||[]),
    ...(draft.post?.sentences||[]).flatMap(x=>x.basis||[]),
    ...(draft.post?.notes||[]).flatMap(x=>x.basis||[]),
    ...(draft.post?.tags||[]).flatMap(x=>x.basis||[])];
  return blocks.length>0 && blocks.every(e=>['itemName','itemCaption','catchcopy'].includes(e.field)
    && typeof e.quote==='string' && e.quote.length>0 && item[e.field].includes(e.quote));
}
async function handler(req,res){
  res.setHeader('Cache-Control','private, no-store, max-age=0');
  res.setHeader('X-Content-Type-Options','nosniff');
  if(process.env.VERCEL_ENV!=='preview' ||
    process.env.VERCEL_GIT_COMMIT_REF!==EXPECTED_BRANCH)
    return reply(res,404,{error:'comparison_unavailable'});
  if(!['GET','POST'].includes(req.method))return reply(res,405,{error:'method_not_allowed'});
  if(req.method==='POST' && !authorizedOrigin(req))return reply(res,403,{error:'origin_rejected'});
  let access;
  try {access=await authorize(req);}catch {return reply(res,503,{error:'authorization_unavailable'});}
  if(!access?.ok || access.plan!=='owner')return reply(res,403,{error:'owner_only'});
  const id=String(req.method==='GET'?req.query?.id:req.body?.id||'');
  const item=loadItem(id);
  if(!item)return reply(res,400,{error:'unknown_fixed_item'});
  const prepared=buildGeminiComparison(item);
  if(req.method==='GET')return reply(res,200,{id,itemCode:item.itemCode,
    name:item.itemName,mode:'offline',held:prepared.held,
    reason:prepared.reason||null,requestHash:prepared.requestHash||null});
  if(req.body?.confirm!=='single-free-tier-call')
    return reply(res,412,{error:'explicit_single_call_confirmation_required'});
  if(!process.env.GEMINI_API_KEY)
    return reply(res,503,{error:'gemini_key_missing'});
  if(prepared.held)return reply(res,409,{error:'source_held',reason:prepared.reason});
  try {
    const result=await compareOnce(item,{execute:true,freeTierConfirmed:true,
      apiKey:process.env.GEMINI_API_KEY});
    return reply(res,200,{id,itemCode:item.itemCode,name:item.itemName,
      status:result.status,hold:result.draft?.hold||null,
      copy:flatten(result.draft),citationsPresent:citationsPresent(result.draft,item),
      unreviewed:true, tokens:result.tokens,requestHash:result.requestHash,
      draft:result.draft});
  }catch(error){
    // Never expose payload, API credentials, provider error body or source.
    return reply(res,502,{error: /^gemini_(?:http_\d+_no_retry|[a-z_]+)$/.test(String(error.message))
      ?error.message:'gemini_comparison_failed_no_retry'});
  }
}
module.exports=handler;
module.exports.loadItem=loadItem;
module.exports.authorizedOrigin=authorizedOrigin;
module.exports.citationsPresent=citationsPresent;
