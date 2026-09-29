'use strict';

const VERIFIER_MODEL='local-structural-v1';

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
function sourceHas(sourceText,pattern){return pattern.test(String(sourceText||''));}
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
async function verifyPost({sourceText,postText}){
  const sentences=splitSentences(postText);
  if(!sentences.length)return{safe:false,keepIndices:[],reasons:['本文なし'],postText:'',raw:{}};
  const keep=[];const reasons=[];
  sentences.forEach((s,i)=>{
    if(keepSentence(s,sourceText)){keep.push(i);reasons.push(`keep:${i}`);}else reasons.push(`drop:${i}`);
  });
  const kept=keep.map(i=>sentences[i]);
  return{safe:kept.length>0,keepIndices:keep,reasons,postText:kept.join('\n'),raw:{engine:VERIFIER_MODEL,keep_indices:keep}};
}

module.exports={VERIFIER_MODEL,splitSentences,bigrams,overlapRatio,allowedDirectBenefit,unsupportedRisk,keepSentence,verifyPost};
