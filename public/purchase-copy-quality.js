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
 function hasUseRelation(text){
  if(sellerNarrative(text))return false;
  const s=normalize(text);
  return /[^。！？]{4,}(?:ため(?:に|の)|ことで|ので|により|によって|に合わせて|に応じて)[^。！？]{4,}/.test(s)
   || /[^。！？]{2,}(?:を|が)[^。！？]{0,30}(?:できます|できる|しやす|やすく|入ります|入る|収まり|楽しめ|味わえ|入れられ|包み込|抑え|おさえ|維持|保護)/.test(s)
   || /[^。！？]{3,}で[^。！？]{3,}(?:しやす|できます|できる)/.test(s);
 }
 function sourceIncludes(source,quote){const q=normalize(quote);return Boolean(q)&&normalize(source).includes(q);}
 return {catalogueOnly,hasUseRelation,sellerNarrative,sourceIncludes};
});
