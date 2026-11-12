'use strict';
// Separate offline editorial experiment: lead with concrete sourced product
// actions, not an interchangeable recommendation hook. This is NOT a publisher.
const {hash}=require('../room-writer-raw/source');
const {preview:sourcePreview}=require('./grounded-local-recovery');

const SPECIFICITY={
 removable: q=>/取[っり]?手|ハンドル/.test(q)?'取っ手を外せる':null,
 stackable: q=>/重ねて収納/.test(q)?'重ねて収納できる':null,
 heat: q=>/IH.*ガス火|ガス火.*IH/.test(q)?'IH・ガス火の両方に対応':null,
 care: q=>/手洗い/.test(q)?'手洗いでお手入れできる':null,
 caution: q=>/洗濯機.*ほつれ.*手洗い/.test(q)?'洗濯機ではほつれる可能性があるため、手洗いを推奨':null,
 integrated: q=>/(?:Type-C|USB-C|Lightning)ケーブル内蔵/i.test(q)?q.replace(/内蔵$/,'を内蔵'):null,
 remaining: q=>/残量表示/.test(q)?q:null,
 use: q=>/ご使用いただけます$/.test(q)?q.replace(/ご使用いただけます$/,'使える'):null,
 dualuse: q=>/としても使える/.test(q)?q:null
};
const blocked=/安全|安心|絶対|必ず|保証|最強|最高|健康|予防|治療/;

function render(identity,claims,relation){
 const has=x=>claims.has(x);
 const get=x=>claims.get(x);
 // Sentence architectures follow which *sourced actions* form a coherent
 // practical situation. No product code or fixed product-name exceptions.
 if(relation==='storage'&&has('removable')&&has('stackable')){
  const label=identity+'。';
  const line1='取っ手を外して、重ねて収納できる'+label;
  const line2=has('heat')?'IH・ガス火の両方に対応しているので、収納方法だけでなく、使う熱源も確認して選べます。':'使うときだけでなく、しまうときの形にも目を向けたい方に。';
  return line1+'\n'+line2;
 }
 if(relation==='care'&&has('care')){
  return '使ったあとは手洗いでお手入れできる'+identity+'。\n'+
   (has('caution')?'洗濯機にかけるとほつれる可能性があるため、手洗いがすすめられています。':'洗い方まで確認して選びたい方に。');
 }
 if(relation==='charging'&&has('integrated')){
  return get('integrated')+'した'+identity+'。\n'+
   (has('remaining')?get('remaining')+'もあるので、ケーブルの構成と残量の見方を一緒に確認できます。':'ケーブルの仕様まで見て選びたい方に。');
 }
 if(relation==='use'&&has('use')&&has('dualuse')){
  const use=get('use').replace(/(?:にも|として)使える$/,'としても使える');
  return use+identity+'。\n'+get('dualuse').replace(/使える$/,'使えるのも特徴です。')+
   '収納だけでなく、使い道も考えて選べます。';
 }
 return null;
}
function propose(item,{identity}={}){
 const source=sourcePreview(item,{identity});
 if(source?.status!=='proposed_requires_independent_review')
  return {status:'held',reason:source?.reason||'no_source_bound_plan',publication:false,copyable:false};
 const claims=new Map(),references=[];
 for(const e of source.evidence){
  const matched=SPECIFICITY[e.axis]?.(e.quote);
  if(!matched||item[e.source]?.slice(e.at,e.at+e.quote.length)!==e.quote)
   return {status:'held',reason:'evidence_alignment_failed',publication:false,copyable:false};
  claims.set(e.axis,matched);
  references.push({axis:e.axis,quote:e.quote,source:e.source,at:e.at});
 }
 const text=render(source.identity,claims,source.relation);
 if(!text||blocked.test(text)||text.length>400)
  return {status:'held',reason:'composition_not_verified',publication:false,copyable:false};
 return {
  version:'narrative-editorial-v1',
  status:'preview_for_owner_review',
  sourceHash:source.sourceHash,
  itemCode:source.itemCode,
  identity:source.identity,
  relation:source.relation,
  evidence:references,
  draft:text,
  draftHash:hash(text),
  publication:false,copyable:false,semanticApproved:false,
  unresolved:['selling_unit_scope','naturalness','independent_six_axis_review']
 };
}
module.exports={propose};
