'use strict';
// Isolated editorial experiment. Not a replacement for the production engine.
// Build a reader-oriented angle only from spans already tied to the source.
// Category differences are *decision relationships*, not product IDs.
const {preview:grounded}=require('./grounded-local-recovery');
const {hash}=require('../room-writer-raw/source');
const policy={publication:false,copyable:false,semanticApproved:false};
const suspicious=/必ず|絶対|安心|安全|改善|予防|治療|快適|ストレスフリー|断然|最強|最高/;
const plain=x=>String(x||'').trim();

function features(evidence){
 const out=new Map();
 for(const e of evidence){
  // This adapter may not create claims absent in the original quote.
  // The lexical transforms below are narrow and auditable.
  const q=e.quote;
  let s=null;
  switch(e.axis){
   case 'use':
    s=q.replace(/にもご使用いただけます$/,'としても使える');break;
   case 'dualuse':
    s=/としても使える$/.test(q)?q:null;break;
   case 'removable':
    s=/取[っり]?手が取り外せる|ハンドルが取り外せる/.test(q)?'取っ手を外せる':null;break;
   case 'stackable':
    s=/重ねて収納/.test(q)?'重ねて収納できる':null;break;
   case 'heat':
    s=/IH.*ガス火|ガス火.*IH/.test(q)?'IHとガス火の両方に対応':null;break;
   case 'care':
    s=/手洗い/.test(q)?'手洗いでお手入れできる':null;break;
   case 'caution':
    s=/洗濯機.*ほつれ.*手洗い/.test(q)?'洗濯機ではほつれる可能性があるため手洗い推奨':null;break;
   case 'integrated':
    s=/(?:Type-C|USB-C|Lightning)ケーブル内蔵/i.test(q)?q:null;break;
   case 'remaining':
    s=/残量表示/.test(q)?q:null;break;
  }
  if(s)out.set(e.axis,{text:s,...e});
 }
 return out;
}
// Lead with a specific everyday decision, not an abstract '選ぶポイント'.
// Questions express possible buyer priorities, not unverified item benefits.
function compose(identity,relation,f){
 const has=k=>f.has(k),val=k=>f.get(k)?.text;
 if(relation==='storage'&&has('removable')&&has('stackable')){
  return '使い終わったあと、重ねてしまえる形を探しているなら。\n'+
   '取っ手を外して重ねて収納できる'+identity+'です。'+
   (has('heat')?'\nIH・ガス火の両方に対応。調理するときの熱源と、しまうときの形を一緒に考えられます。':'\n片付けるときの形まで見て選びたい方に。');
 }
 if(relation==='care'&&has('care')){
  return '掃除道具は、使ったあとのお手入れ方法も気になるもの。\n'+
   '手洗いできる'+identity+'です。'+
   (has('caution')?'\n洗濯機ではほつれる可能性があるため、手洗いがおすすめと案内されています。':'');
 }
 if(relation==='charging'&&has('integrated')){
  return '外出先の充電を考えるなら、ケーブルを本体に備えたタイプも候補。\n'+
   val('integrated')+'の'+identity+'です。'+
   (has('remaining')?'\n'+val('remaining')+'も付いているので、残量確認の方法まで気になる方に。':'');
 }
 if(relation==='use'&&has('use')&&has('dualuse')){
  return '庭先の道具をしまう場所も、腰掛ける場所も考えたい。\n'+
   val('use').replace(/にも使える$/,'としても使える')+identity+'。'+
   '\n'+val('dualuse').replace(/使える$/,'使えます。');
 }
 return null;
}
function propose(item,{identity}={}){
 const base=grounded(item,{identity});
 if(base.status!=='proposed_requires_independent_review')
  return {...policy,status:'held',reason:base.reason||'grounding_failed'};
 const f=features(base.evidence);
 if(f.size!==base.evidence.length)
  return {...policy,status:'held',reason:'feature_transform_unverified'};
 for(const e of base.evidence){
  if(item[e.source]?.slice(e.at,e.at+e.quote.length)!==e.quote)
   return {...policy,status:'held',reason:'original_quote_mismatch'};
 }
 const draft=compose(base.identity,base.relation,f);
 if(!plain(draft)||suspicious.test(draft)||draft.length>500)
  return {...policy,status:'held',reason:'composition_failed'};
 return {
  ...policy,status:'owner_preview_only',version:'reader-value-draft-v1',
  itemCode:base.itemCode,sourceHash:base.sourceHash,
  relation:base.relation,identity:base.identity,
  evidence:base.evidence,draft,draftHash:hash(draft),
  limitations:['reader_scene_is_a_question_not_a_product_claim','selling_unit_not_verified','no_quality_certification']
 };
}
module.exports={propose};
