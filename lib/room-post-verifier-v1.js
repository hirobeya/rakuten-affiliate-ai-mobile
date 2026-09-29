'use strict';

const VERIFIER_MODEL='local-structural-v2';

function compact(v=''){return String(v||'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();}
function splitSentences(text=''){
  return String(text||'').split(/(?<=[。！？!?])\s*|\n+/).map(x=>x.trim()).filter(Boolean);
}
function bigrams(text=''){
  const s=compact(text).replace(/[、。！？!?「」『』（）()［］【】・,:：;；]/g,'');
  const out=[];for(let i=0;i<s.length-1;i++)out.push(s.slice(i,i+2));return out;
}
function overlapRatio(sentence,sourceText){
  const grams=bigrams(sentence);if(!grams.length)return 0;
  const src=new Set(bigrams(sourceText));let hit=0;for(const g of grams)if(src.has(g))hit++;
  return hit/grams.length;
}
function allowedDirectBenefit(sentence,sourceText){
  const s=String(sentence||'');const src=String(sourceText||'');
  if(/スマホ対応/i.test(src)&&/(スマホ|携帯).*(外さず|外す手間|操作|確認)/i.test(s))return true;
  if(/(?:\d+[枚個本袋包錠粒台足着]|枚入り|個入り|本入り|袋入り|セット)/i.test(src)&&/(買い足|補充|ストック|まとめて|必要量|回数を減ら)/i.test(s))return true;
  if(/折りたた|折畳/i.test(src)&&/(使わない|未使用|収納|しま|たた)/i.test(s))return true;
  if(/(?:\d+\s*℃\s*単位|温度設定|温度調整)/i.test(src)&&/(温度).*(選|設定|合わせ|調整)|毎回同じ設定|飲み物に合わせ/i.test(s))return true;
  if(/(?:高さ|幅|奥行|長さ|サイズ|寸法|\d+\s*(?:mm|cm|m))/i.test(src)&&/(置き場所|設置|入るか|収ま|サイズ).*(確認|比べ|選)/i.test(s))return true;
  return false;
}
const RISK_TERMS=[
  /疲れ|負担が少|持ち運びやす|軽くて楽|操作が軽|握りやす/i,
  /安心|安全|シャワー|浴室|濡れた手|水洗い|水滴|風呂/i,
  /外出先|旅行先|車内|pc|パソコン|モバイルバッテリー|コンセントがない/i,
  /深剃り|肌に優|すばやく|スムーズ|よく剃|剃りやす/i,
  /味が|味を|おいし|安定した|品質が|高性能|高級|丈夫|柔らか/i,
  /保温できる|冷めにく|温かいまま/i
];
const PROMO_FACT_RE=/(送料無料|クーポン|ポイント|ランキング|最安|激安|限定|セール|sale|no\.?1|第\d+位|受賞)/i;
const IDENTITY_FACT_RE=/^(?:商品|メンズ|レディース|男女兼用|男性用|女性用)$/i;
const FEATURE_HINT_RE=/(?:\d|usb|type-?c|ipx|防水|充電|対応|折り|収納|温度|設定|調整|耐荷重|容量|サイズ|幅|高さ|奥行|長さ|素材|本革|山羊革|刃|枚|個|本|袋|包|段|色|付属|内蔵|式|可能)/i;
function unsupportedRisk(sentence,sourceText){
  const src=compact(sourceText);const s=String(sentence||'');
  for(const re of RISK_TERMS){
    const m=s.match(re);if(!m)continue;
    if(!src.includes(compact(m[0])))return true;
  }
  return false;
}
function keepSentence(sentence,sourceText){
  if(unsupportedRisk(sentence,sourceText))return false;
  if(allowedDirectBenefit(sentence,sourceText))return true;
  return overlapRatio(sentence,sourceText)>=0.46;
}
function groundedFacts(factsUsed=[],sourceText='',productSummary=''){
  const src=compact(sourceText);const summary=compact(productSummary);const seen=new Set();const rows=[];
  for(const raw of Array.isArray(factsUsed)?factsUsed:[]){
    const fact=String(raw||'').trim().replace(/[。！？!?]+$/,'');
    const n=compact(fact);
    if(!fact||fact.length>36||n.length<2||!src.includes(n)||PROMO_FACT_RE.test(fact)||IDENTITY_FACT_RE.test(fact))continue;
    if(summary&&(n===summary||summary.includes(n)||n.includes(summary)))continue;
    if(seen.has(n))continue;
    seen.add(n);rows.push({fact,score:(FEATURE_HINT_RE.test(fact)?3:0)+(\d/.test(fact)?2:0)+(fact.length<=18?1:0)});
  }
  return rows.sort((a,b)=>b.score-a.score||a.fact.length-b.fact.length).slice(0,4).map(x=>x.fact);
}
function buildGroundedSelectionLine({factsUsed=[],sourceText='',productSummary=''}){
  const facts=groundedFacts(factsUsed,sourceText,productSummary);
  if(facts.length<2)return'';
  const label=String(productSummary||'').trim();
  const head=label?`${label}で、`:'';
  return `${head}${facts.join('・')}を条件に選びたい人に。必要な仕様がはっきりしている時に、候補を絞りやすい組み合わせです。`;
}
async function verifyPost({sourceText,postText,factsUsed=[],productSummary=''}){
  const sentences=splitSentences(postText);
  if(!sentences.length)return{safe:false,keepIndices:[],reasons:['本文なし'],postText:'',raw:{}};
  const keep=[];const reasons=[];
  sentences.forEach((s,i)=>{
    if(keepSentence(s,sourceText)){keep.push(i);reasons.push(`keep:${i}`);}else reasons.push(`drop:${i}`);
  });
  const kept=keep.map(i=>sentences[i]);
  let safeText=kept.join('\n');
  const thin=safeText.replace(/\s/g,'').length<70||kept.length<2;
  const selectionLine=thin?buildGroundedSelectionLine({factsUsed,sourceText,productSummary}):'';
  if(selectionLine){safeText=[safeText,selectionLine].filter(Boolean).join('\n');reasons.push('append:grounded-selection');}
  return{safe:Boolean(safeText),keepIndices:keep,reasons,postText:safeText,raw:{engine:VERIFIER_MODEL,keep_indices:keep,grounded_selection:Boolean(selectionLine)}};
}

module.exports={VERIFIER_MODEL,splitSentences,bigrams,overlapRatio,allowedDirectBenefit,unsupportedRisk,keepSentence,groundedFacts,buildGroundedSelectionLine,verifyPost};
