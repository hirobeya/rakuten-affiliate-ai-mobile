'use strict';
// Evidence-first candidates for the opt-in local editorial path.
// This module cannot publish or call a provider. Its output still passes the
// existing candidate kernel and all local publication safety vetoes.
const {hasUseRelation,sellerNarrative,catalogueOnly}=require('../../public/purchase-copy-quality');
const {RISK}=require('../../public/structured-room-copy');
const {PROMO_RE}=require('../../public/fact-safety');
const clean=x=>String(x||'').normalize('NFKC').replace(/\s+/g,' ').trim();
const BAD_SCOPE=/(?:関連商品|別売(?:り)?|付属品|他の商品|同シリーズ|おすすめ商品|当店|弊社|当社|レビュー|ランキング|クーポン|送料|配送|ご購入|ご注文)/;
const BAD_ASSERTION=/(?:絶対|必ず|最強|最高|効果抜群|健康になる|治療|治る|予防|安心|安全|保証|疲労回復|痩せる)/;
const HEADLINE=/^(?:商品説明|特徴|ポイント|POINT|商品仕様|使い方|おすすめ)[：:\s]/i;
const PRACTICAL=/(?:できる|できます|可能(?:です)?|入れられ|取り出せ|収納でき|抑え|おさえ|減らせ|防げ|洗える|選べる|使える|しやす|合わせられ|調整でき)/;
const RELATION=/(?:ことで|により|によって|に合わせて|に応じて|すると|すれば|したら|ので|ために|と、)/;
function sourceSentences(raw){
  const text=String(raw||'');
  // Keep original offsets, including UTF-16 positions, for auditability.
  const rows=[];const re=/[^。！？!\r\n]+[。！？!]?/g;let m;
  while((m=re.exec(text))&&rows.length<100){
    const part=m[0],left=part.search(/\S/);
    if(left<0)continue;
    const value=part.slice(left).trimEnd();
    rows.push({quote:value,start:m.index+left,end:m.index+left+value.length});
  }
  return rows;
}
function candidateClaims({itemName='',itemCaption='',identity=''}={}){
  const title=clean(itemName),id=clean(identity),caption=String(itemCaption||'');
  if(!id||!title.includes(id)||!caption)return [];
  const rows=sourceSentences(caption);
  const output=[],seen=new Set();
  const first=clean(caption.slice(0,150));
  const headingBound=first.includes(id)&&!BAD_SCOPE.test(first.slice(0,Math.max(0,first.indexOf(id))));
  for(const row of rows){
    const quote=clean(row.quote);
    if(quote.length<16||quote.length>150||seen.has(quote))continue;
    if(/[<>|｜]/.test(quote)||HEADLINE.test(quote)||BAD_SCOPE.test(quote)||BAD_ASSERTION.test(quote)||PROMO_RE.test(quote)||sellerNarrative(quote)||RISK.test(quote)||catalogueOnly(quote))continue;
    if(/(?:非対応|対象外|別売|できない|できません|ません|不可|付属しない)/.test(quote))continue;
    if(!RELATION.test(quote)||!PRACTICAL.test(quote)||!hasUseRelation(quote))continue;
    // Do not associate a free-floating caption with a product from another listing.
    if(!quote.includes(id)&&!headingBound)continue;
    // A sentence must describe an operation/use relationship, not a sales slogan.
    const sourceIsComplete=/[。！？!]$/.test(quote);
    if(!sourceIsComplete)continue;
    const text=quote.includes(id)?quote:id+'は、'+quote;
    if(RISK.test(text))continue;
    seen.add(quote);
    output.push({
      kind:'caption_claim',quote:row.quote,source:'itemCaption',
      sourceSpan:{start:row.start,end:row.end},
      axis:'原文の使用関係',hook:'',body:text,score:14,
      strongDirect:true,evidenceRelation:'explicit_source_use_relation'
    });
  }
  return output.slice(0,8);
}
module.exports={sourceSentences,candidateClaims};
