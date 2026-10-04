'use strict';

const {evaluatePartnerCandidates}=require('./partner-decision-kernel');

function normalize(value=''){
  return String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
}

const PATTERNS=[
  {kind:'capacity',re:/(\d+(?:\.\d+)?\s?(?:ml|mL|L|ℓ|リットル|mAh|Wh))/i,axis:'容量',scene:'使う量や容量を見て選びたいとき',body:(q,id)=>`${q}容量の${id}です。`},
  {kind:'size',re:/(\d+(?:\.\d+)?\s?(?:cm|mm|m|インチ))/i,axis:'サイズ',scene:'サイズも確認して選びたいとき',body:(q,id)=>`${q}のサイズ表記がある${id}です。`},
  {kind:'washable',re:/(食洗機対応|洗える|丸洗い)/,axis:'お手入れ',scene:'お手入れ方法も確認して選びたいとき',body:(q,id)=>`${q}の${id}です。`},
  {kind:'folding',re:/(折りたたみ|折り畳み)/,axis:'収納形態',scene:'使わないときの収納方法も見て選びたいとき',body:(q,id)=>`${q}仕様の${id}です。`},
  {kind:'mount',re:/(壁掛け|キャスター付き|据え置き)/,axis:'設置・構造',scene:'設置方法や構造も確認して選びたいとき',body:(q,id)=>`${q}の${id}です。`},
  {kind:'material',re:/(ステンレス|アルミ|木製|セラミック|本革|山羊革|コットン|ポリエステル)/,axis:'素材・構造',scene:'素材や構造も確認して選びたいとき',body:(q,id)=>`${q}を使った${id}です。`},
  {kind:'temperature',re:/(温度調節|温度設定|\d+℃(?:\s?[〜~-]\s?\d+℃)?)/,axis:'温度設定',scene:'温度を選んで使いたいとき',body:(q,id)=>`${q}に対応した${id}です。`},
  {kind:'smartphone',re:/(スマホ対応|スマートフォン操作対応|タッチ操作対応)/,axis:'操作対応',scene:'対応機能も確認して選びたいとき',body:(q,id)=>`${q}の${id}です。`}
];

function exactQuote(source,re){
  const m=normalize(source).match(re);
  return m?normalize(m[1]||m[0]):'';
}

function buildCandidates(item={},identity='',knowledge=null){
  const title=normalize(item.itemName);
  const caption=normalize(item.itemCaption);
  const source=`${title} ${caption}`;
  const candidates=[];
  for(const p of PATTERNS){
    const quote=exactQuote(source,p.re);
    if(!quote) continue;
    // Keep local imagination constrained to purchase intent, never factual expansion.
    const text=p.body(quote,identity);
    candidates.push({
      kind:p.kind,
      quote,
      axis:p.axis,
      scene:p.scene,
      text,
      sourceExact:true,
      score:0,
      confidence:'medium'
    });
  }
  return candidates;
}

function buildPurchaseReason(item={},identity='',knowledge=null){
  identity=normalize(identity);
  if(!identity) return null;
  const candidates=buildCandidates(item,identity,knowledge);
  if(!candidates.length) return null;

  const evaluated=evaluatePartnerCandidates
    ? evaluatePartnerCandidates(candidates,{item,identity,knowledge})
    : null;

  const ranked=Array.isArray(evaluated?.candidates)&&evaluated.candidates.length
    ? evaluated.candidates
    : candidates.map((c,i)=>({...c,score:10-i,confidence:'medium'}));

  const best=ranked[0];
  if(!best) return null;
  if(best.blocked===true||best.confidence==='low') return null;
  return {
    scene:best.scene,
    body:best.text,
    quote:best.quote,
    axis:best.axis,
    kind:best.kind,
    confidence:best.confidence||'medium',
    candidates:ranked
  };
}

module.exports={PATTERNS,buildCandidates,buildPurchaseReason};
