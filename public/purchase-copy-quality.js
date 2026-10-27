(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.UrenaviPurchaseCopyQuality=api;})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const normalize=x=>String(x||'').normalize('NFKC').replace(/\s+/g,' ').trim();
 // Reject editorial scaffolding, not product claims. Safety and semantic
 // verification remain separate; this module never certifies factual support.
 function catalogueOnly(text){
  const s=normalize(text);
  return /(?:見て|確認して|見比べて)選(?:ぶ|び)/.test(s)
   || /(?:点|ところ)(?:が|は)(?:選びやす|適しています)/.test(s)
   || /「[^」]{1,45}」表記の/.test(s)
   || /表記(?:がある|の)[^。！？]{0,30}(?:です|。)/.test(s);
 }
 // Seller actions are not actions performed by the product. These passages
 // remain available to the semantic writer, which must preserve the actor.
 function sellerNarrative(text){
  return /(?:当社|弊社|当店|私たち|スタッフ|生産者|製造者|農家|職人)|(?:話し合|追求して|取り組んで|目指して|買い付け|仕入れ|開発して|検品して|お届けして)/.test(normalize(text));
 }
 // A ranking hint for complete source sentences. It is not an entailment
 // verdict and must never replace source binding or the five review questions.
 function hasChoiceRelation(text){
  const s=normalize(text);
  if(/ではな|ではあり|できな|できませ|不可|対象外|別売|関連商品/.test(s))return false;
  return /[^。！？]{1,}組み合わせ(?:は|が)?自由[^。！？]{0,20}選べる\d+(?:枚|個|本|袋|組|点|箱|足)セット/.test(s);
 }
 function hasUseRelation(text){
  if(sellerNarrative(text))return false;
  const s=normalize(text);
  return /[^。！？]{4,}(?:ため(?:に|の)|ことで|ので|により|によって|に合わせて|に応じて)[^。！？]{4,}/.test(s)
   || hasChoiceRelation(s)
   || /[^。！？]{2,}(?:を|が)[^。！？]{0,30}(?:できます|できる|しやす|やすく|入ります|入る|収まり|楽しめ|味わえ|入れられ|包み込|抑え|おさえ|維持|保護)/.test(s)
   || /[^。！？]{3,}で[^。！？]{3,}(?:しやす|できます|できる)/.test(s);
 }
 // Rejection only: having an exact feature quote is not a purchase reason.
 // This does not approve other prose or replace source/semantic review.
 function restatedReason(text,{identity='',quote=''}={}){
  const lines=String(text||'').split(/\n+/).map(normalize).filter(x=>x&&!/^価格[:：]/.test(x)&&!/^※アフィリエイト広告/.test(x));
  const id=normalize(identity),q=normalize(quote);
  if(id&&lines.some(x=>x.replace(/[。.!！]+$/g,'')===id+'です')){
   const compatibility=lines.map(x=>x.match(/での([^。]{1,18})に対応/)).find(Boolean);
   if(compatibility&&lines.filter(x=>x.includes(compatibility[1])).length>=2)return 'repeated_use_and_identity_only';
  }
  const body=lines.join(' ');
  // A configurable assortment followed only by "convenient" still does not
  // explain how the configuration serves the stated intention. This is a
  // structural veto across product kinds, not a category/brand exception.
  const configuration=/(?:組み合わせ|組合せ)(?:は|が)?自由/.test(body);
  const explicitRelation=/(?:ため|ことで|ので|により|によって|に合わせて|に応じて)/.test(body);
  if(configuration&&!explicitRelation&&/(?:が|は)(?:とても|とっても)?便利(?:です|。|[!！]|$)/.test(body))return 'configuration_with_generic_convenience_only';
  if(hasChoiceRelation(body)&&!/(?:ため|ことで|ので|により|によって|に合わせて|に応じて)/.test(body))return 'choice_configuration_without_use_relation';
  if(lines.length===2&&id&&q){
   const claim=lines[1].replace(/[。.!！]+$/g,'');
   const core=q.replace(/(?:対応|仕様|機能|付き|付|式)$/,'');
   const bare=[q+'の'+id+'です',q+'仕様の'+id+'です',q+'対応の'+id+'です',q+'に対応した'+id+'です',q+'付きの'+id+'です'];
   if(core.length>=2&&(lines[0].includes(core)||/(?:形|仕様|機能|対応|方式|構造)(?:で|も|を|まで)[^。]{0,14}選/.test(lines[0]))&&bare.includes(claim))return 'feature_and_hook_restate_each_other';
  }
  return '';
 }
 function sourceIncludes(source,quote){const q=normalize(quote);return Boolean(q)&&normalize(source).includes(q);}
 return {catalogueOnly,hasUseRelation,hasChoiceRelation,sellerNarrative,sourceIncludes,restatedReason};
});
