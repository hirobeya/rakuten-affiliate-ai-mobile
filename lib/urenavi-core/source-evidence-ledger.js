'use strict';
// Independent evidence layer: exact seller source -> scoped product -> usable
// feature/reason, with no generative paraphrasing and no publication approval.
// A new candidate is not automatically a publishable ROOM post.
const normalize=s=>String(s||'').normalize('NFKC').replace(/\s+/g,' ').trim();
const STOP=/(?:【関連商品】|関連商品はこちら|関連商品はコチラ|検索用キーワード|関連商品一覧)/;
const OTHER=/(?:関連商品|おすすめ商品|別売り?|別の商品|他の商品|こちらもおすすめ)/;
const NEG=/(?:できない|できません|使えない|使えません|選べない|選べません|組み合わせられない|対応しない|対応不可|非対応|対象外|付属しない|付属なし|不可|ではありません|別売)/;
const PROMO=/(?:楽天(?:ランキング|1位)|クーポン|送料無料|レビュー特典|ポイント\d*倍|お買い物マラソン|最安値|大人気|爆売れ)/;
const RISK=/(?:必ず|絶対|100%|どんな場所でも|すべての人|完全に|心配ありません|安全性も抜群|確実に)/;
const FEATURE=/(?:取り外せる|取り外し可能|取り出し|重ねて収納|収納できる|収納可能|調節|調整|組み合わせ|使い分け|使える|使えます|使用できる|使用できます|洗える|入る|入れられる|包み込|おさえ|抑え|カスタマイズ|持ち運び|兼用でき|選べる|選べます|分けて収納)/;
const REASON=/(?:ことで|により|によって|ので|に合わせて|に応じて|できるほか|としても|使い分け|組み合わせ|取り出しやす|使いやす|収納できる|入れられる|包み込|抑え|おさえ|カスタマイズ)/;
function extractEvidence({itemName='',itemCaption='',identity=''}={}){
 const id=normalize(identity),title=normalize(itemName);
 const raw=String(itemCaption||'');
 if(!id||!title.includes(id)||!raw)return {status:'insufficient_source',facts:[],reason:'missing_identity_or_caption'};
 const stop=raw.search(STOP),scoped=stop<0?raw:raw.slice(0,stop);
 const facts=[];
 // Keep exact source spans; never splice a head and tail across omitted text.
 // A sentence ends at sentence punctuation or a hard merchant bullet boundary.
 const chunks=/[^。！？!\n●■◆]+[。！？!]?/g;
 let match;
 while((match=chunks.exec(scoped))){
  const full=match[0],quote=full.trim();
  const start=match.index+full.indexOf(quote),end=start+quote.length;
  if(quote.length<16||quote.length>150||!/[。！？!]$/.test(quote)||!FEATURE.test(quote))continue;
  // Exclude merchant SEO blocks and mixed bullet/table fragments that are
  // not a standalone attributable seller sentence.
  if(/[【】<>＜＞]|(?:商品説明|商品特長|メーカーサイト|仕様 ?\(|商品名|注意書き|スペック)/.test(quote))continue;
  if(OTHER.test(quote)||NEG.test(quote)||PROMO.test(quote)||RISK.test(quote))continue;
  if(/(?:安心|安全|雑菌|消臭|殺菌|除菌|抗菌|防臭|治る|医療|発火|保証)/.test(quote))continue;
  const before=scoped.slice(Math.max(0,start-300),start);
  // Exact product mentions or a nearby merchant introduction support scope.
  // Presence of a bare word in a 300-char advertisement alone does not.
  const self=quote.includes(id);
  const introduced=/(?:商品説明|商品名|この|本商品)/.test(before)
   &&before.includes(id)
   &&!OTHER.test(before.slice(Math.max(0,before.lastIndexOf(id))));
  if(!self&&!introduced)continue;
  const hasReason=REASON.test(quote);
  facts.push({quote,source:'itemCaption',start,end,identity:id,
   claimType:hasReason?'source_purchase_relation':'source_feature',
   subjectBinding:self?'explicit_identity':'merchant_intro',
   publicationApproved:false});
 }
 return {status:facts.length?'candidates':'no_verified_causal_source',facts,reason:facts.length?null:'no_safe_source_relation'};
}
function verifyEvidence(item,ledger){
 const src=String(item?.itemCaption||''),name=normalize(item?.itemName);
 if(!ledger||!Array.isArray(ledger.facts))return false;
 return ledger.facts.every(f=>
  f.source==='itemCaption'&&f.publicationApproved===false
  &&Number.isInteger(f.start)&&Number.isInteger(f.end)
  &&src.slice(f.start,f.end)===f.quote
  &&name.includes(f.identity)&&f.identity.length>=2
  &&['source_purchase_relation','source_feature'].includes(f.claimType)
  &&['explicit_identity','merchant_intro'].includes(f.subjectBinding));
}
module.exports={extractEvidence,verifyEvidence};
