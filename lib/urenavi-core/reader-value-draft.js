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
  const lead='フライパンの収納場所、もう少し工夫したいと思ったら。';
  // No identity-specific prose: the situation is "things that stack with a detachable handle".
  const neutral='しまうときは取っ手を外して、重ねて収納できる'+identity+'。';
  return '収納場所を考えて選びたいなら。\n'+neutral+
   (has('heat')?'\nIHとガス火の両方に対応。調理する熱源と、片付けるときの形を一緒に考えられます。':'\n使うときだけでなく、片付け方にも目を向けた選び方です。');
 }
 if(relation==='care'&&has('care')){
  return '使い終わったあとの洗い方も、気になるところ。\n'+
   '手洗いでお手入れできる'+identity+'です。'+
   (has('caution')?'\n洗濯機ではほつれる可能性があるため、手洗い推奨。この点も知って選びたい商品です。':'');
 }
 if(relation==='charging'&&has('integrated')){
  return '外出するとき、充電用ケーブルの持ち方も考えておきたい。\n'+
   val('integrated')+'の'+identity+'です。'+
   (has('remaining')?'\n'+val('remaining')+'も備えています。充電方法と残量の確認方法、両方を見て選べます。':'');
 }
 if(relation==='use'&&has('use')&&has('dualuse')){
  const a=val('use').replace(/としても使える$/,'にも使える');
  return '庭先で使う道具の収納と、ちょっと腰掛ける場所。どちらも考えるなら。\n'+
   a+identity+'です。\n'+val('dualuse')+'ので、置き場所だけでなく使い道にも注目したい一品です。';
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
