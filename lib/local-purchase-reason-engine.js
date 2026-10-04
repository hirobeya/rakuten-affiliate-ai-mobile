'use strict';

const {selectBestCandidate,shouldPublish}=require('./partner-decision-kernel');

function normalize(value=''){
  return String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
}

const PATTERNS=[
  {kind:'numeric',re:/(\d+(?:\.\d+)?\s?(?:ml|mL|L|ℓ|リットル|mAh|Wh))/i,axis:'容量',score:4,scene:'使う量や容量を見て選びたいとき',body:(q,id)=>`${q}容量の${id}です。`},
  {kind:'numeric',re:/(\d+(?:\.\d+)?\s?(?:cm|mm|m|インチ))/i,axis:'サイズ',score:4,scene:'サイズも確認して選びたいとき',body:(q,id)=>`${q}のサイズ表記がある${id}です。`},
  {kind:'signal',re:/(食洗機対応|洗える|丸洗い)/,axis:'お手入れ',score:8,scene:'お手入れ方法も確認して選びたいとき',body:(q,id)=>`${q}の${id}です。`},
  {kind:'signal',re:/(折りたたみ|折り畳み)/,axis:'収納形態',score:8,scene:'使わないときの収納方法も見て選びたいとき',body:(q,id)=>`${q}仕様の${id}です。`},
  {kind:'signal',re:/(壁掛け|キャスター付き|据え置き)/,axis:'設置・構造',score:8,scene:'設置方法や構造も確認して選びたいとき',body:(q,id)=>`${q}の${id}です。`},
  {kind:'signal',re:/(ステンレス|アルミ|木製|セラミック|本革|山羊革|コットン|ポリエステル)/,axis:'素材・構造',score:6,scene:'素材や構造も確認して選びたいとき',body:(q,id)=>`${q}を使った${id}です。`},
  {kind:'signal',re:/(温度調節|温度設定|\d+℃(?:\s?[〜~-]\s?\d+℃)?)/,axis:'温度設定',score:8,scene:'温度を選んで使いたいとき',body:(q,id)=>`${q}に対応した${id}です。`},
  {kind:'signal',re:/(スマホ対応|スマートフォン操作対応|タッチ操作対応)/,axis:'操作対応',score:7,scene:'対応機能も確認して選びたいとき',body:(q,id)=>`${q}の${id}です。`}
];

function exactQuote(source,re){
  const m=normalize(source).match(re);
  return m?normalize(m[1]||m[0]):'';
}

function buildCandidates(item={},identity=''){
  const source=`${normalize(item.itemName)} ${normalize(item.itemCaption)}`.trim();
  const candidates=[];
  for(const p of PATTERNS){
    const quote=exactQuote(source,p.re);
    if(!quote) continue;
    const body=p.body(quote,identity);
    candidates.push({
      kind:p.kind,
      quote,
      axis:p.axis,
      intent:p.scene,
      hook:p.scene,
      body,
      score:p.score,
      sourceExact:true
    });
  }
  return candidates;
}

function buildPurchaseReason(item={},identity='',knowledge=null){
  identity=normalize(identity);
  if(!identity) return null;
  const source=`${normalize(item.itemName)} ${normalize(item.itemCaption)}`.trim();
  const candidates=buildCandidates(item,identity);
  if(!candidates.length) return null;

  const best=selectBestCandidate(candidates,{
    source,
    identity,
    decisionAxes:Array.isArray(knowledge?.decisionAxes)?knowledge.decisionAxes:[],
    situations:Array.isArray(knowledge?.situations)?knowledge.situations:[],
    blockedInferences:Array.isArray(knowledge?.blockedInferences)?knowledge.blockedInferences:[]
  });
  if(!best||!shouldPublish(best)) return null;

  return {
    scene:best.intent,
    body:best.body,
    quote:best.quote,
    axis:best.axis,
    kind:best.kind,
    confidence:best.decision?.confidence||'medium',
    decision:best.decision
  };
}

module.exports={PATTERNS,buildCandidates,buildPurchaseReason};
