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
   || /表記(?:がある|の)[^。！？]{0,30}(?:です|。)/.test(s)
   // Copying a seller's promotional assertion verbatim does not make it a
   // concrete purchase reason. The writer already forbids these assertions.
   || /(?:の決定版|必須のアイテム|に最適)(?:です|で[、,]|[。！!])/.test(s);
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
 function sourceOperationReason(quote){
  const q=normalize(quote);
  return /^(?:[^。]{1,14}を(?:上げる|開ける|押す|引く)と、)[^。]{3,}(?:収納可能|使用可能|取り出せる|できます|できる|しやすい)[。]?$/.test(q);
 }
 // Server checks the exact rule and permitted intent. The browser checks
 // source binding and published structure independently; no fabricated
 // quote or standalone spec can become a copyable result.
 function verifiedTitleSignal(item,partner,text){
  if(partner?.kind!=='signal'||typeof text!=='string')return false;
  const quote=String(partner.quote||'');
  if(quote.length<4||!sourceIncludes(item?.itemName,quote))return false;
  const rows=text.split(/\n+/).map(x=>x.trim()).filter(Boolean);
  if(rows.length<4||!/(?:したいとき|使いたいとき|持ち歩きたいとき|選びたいとき)[。]?$/.test(rows[0])
    ||/(?:見て選|確認して選|仕様も見)/.test(rows[0]))return false;
  if(!rows[1].includes(quote)||catalogueOnly(text))return false;
  return true;
 }
 function verifiedLinkedReason(item,partner,text){
  const facts=partner?.linkedEvidence;
  if(!Array.isArray(facts)||facts.length!==2||typeof text!=='string')return false;
  const caption=String(item?.itemCaption||'');
  if(!caption||!caption.includes(String(partner?.quote||'')))return false;
  if(!facts.every(f=>f?.source==='itemCaption'&&typeof f.quote==='string'&&f.quote.length>=4
    &&caption.includes(f.quote)&&text.includes(f.quote)))return false;
  // Only the server may approve the composed relationship. The browser
  // independently verifies every exact source clause, not a ready flag.
  const first=facts[0].quote,second=facts[1].quote;
  if(first===second||partner.quote!==first)return false;
  const firstAt=caption.indexOf(first);
  const secondAt=caption.indexOf(second,firstAt+first.length);
  // Both must describe the same selling unit in consecutive source sentences.
  // A related-item listing or an intervening different feature invalidates
  // the link even when both phrases independently exist in the source.
  if(firstAt<0||secondAt<0||caption.slice(firstAt+first.length,secondAt).trim())return false;
  const context=caption.slice(Math.max(0,firstAt-180),secondAt+second.length);
  if(/(?:関連商品|おすすめ商品|別売り|別商品|他の商品)/.test(context))return false;
  return text.includes(first)&&text.includes(second);
 }

 // The selling unit may be named in the preceding complete sentence while
 // the next sentence explains alternative ways to use it. Verify BOTH the
 // specific seller-authored use sentence and the exact preceding unit name.
 // This is a generic grammatical relationship, not a whitelist of products.
 function verifiedSourceMultiUse(item,partner,identity,text){
  const quote=String(partner?.quote||''),id=normalize(identity);
  const caption=String(item?.itemCaption||'');
  if(partner?.kind!=='caption_claim'||!id||quote.length<22
     ||!caption.includes(quote)||!String(text||'').includes(quote))return false;
  if(!/(?:としても|として|できるほか|できる上|兼用でき|使い分け|用途に合わせて|シーンに合わせて)/.test(quote)
    ||!/(?:使用できます|使用できる|使えます|使える|装着できます|装着できる|兼用できます|兼用できる|選べます|選べる)/.test(quote))return false;
  if(/(?:関連商品|おすすめ商品|別売|他の商品|別商品|非対応|対応していない|できない|できません|不可|必ず|絶対|100%|最適|保証|大活躍)/.test(quote))return false;
  const at=caption.indexOf(quote),before=caption.slice(Math.max(0,at-220),at);
  // When the target name is absent on the claim, it must be the subject
  // explicitly introduced by the last nearby complete source sentence.
  if(!quote.includes(id)&&!before.includes(id+'です。'))return false;
  if(/(?:関連商品|おすすめ商品|別売り|別商品|他の商品)/.test(before))return false;
  return true;
 }


 // One source-grounded admission contract shared by server and iPhone.
 // A server's 'ready' flag is not evidence. Product identity, full output,
 // quotation, sentence relation and item ownership must independently agree.
 function verifiedLocalCopy(item,result,text){
  const body=String(text||''),partner=result?.local?.partner;
  if(!result?.ok||result.pending!==false||result.model!=='local'||result.phase!=='local'
    ||result.quality?.status!=='ready'||result.groq?.totalCalls!==0
    ||!body.trim()||result.quality.text!==body||result.variants?.length!==1
    ||result.variants[0]?.text!==body)return false;
  const id=String(result.productType?.specific||'');
  const typeQuote=String(result.productType?.quote||'');
  if(!id||!typeQuote||!sourceIncludes(item?.itemName,typeQuote))return false;
  let owned=false;
  if(partner?.kind==='caption_claim'){
   const quote=String(partner.quote||'');
   owned=quote.length>=8&&sourceIncludes(item?.itemCaption,quote)&&body.includes(quote)
     &&(Array.isArray(partner.linkedEvidence)&&partner.linkedEvidence.length
       ?verifiedLinkedReason(item,partner,body)
       :hasUseRelation(quote)||sourceOperationReason(quote)
         ||verifiedSourceMultiUse(item,partner,id,body));
  }else if(partner?.kind==='signal'){
   owned=verifiedTitleSignal(item,partner,body);
  }
  if(!owned||catalogueOnly(body)
    ||restatedReason(body,{identity:id,quote:partner?.quote||''}))return false;
  return true;
 }

 return {catalogueOnly,hasUseRelation,hasChoiceRelation,sellerNarrative,sourceIncludes,sourceOperationReason,verifiedLinkedReason,verifiedSourceMultiUse,verifiedTitleSignal,verifiedLocalCopy,restatedReason};
});
