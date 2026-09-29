'use strict';

const VERIFIER_MODEL='local-structural-v4';

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
  if(/スマホ対応/i.test(src)&&/スマホ/i.test(s)&&/(外さず|外す手間|操作|確認)/i.test(s))return true;
  if(/(?:\d+[枚個本袋包錠粒台足着]|枚入り|個入り|本入り|袋入り|セット)/i.test(src)&&/\d|枚|個|本|袋|包|錠|粒|台|足|着|セット/i.test(s)&&/(買い足|補充|ストック|まとめて|必要量|回数を減ら)/i.test(s))return true;
  if(/折りたた|折畳/i.test(src)&&/(折りたた|折畳|たた)/i.test(s)&&/(使わない|未使用|収納|しま|たた)/i.test(s))return true;
  if(/(?:\d+\s*℃\s*単位|温度設定|温度調整)/i.test(src)&&/(温度|℃)/i.test(s)&&/(選|設定|合わせ|調整|毎回同じ)/i.test(s))return true;
  if(/(?:高さ|幅|奥行|長さ|サイズ|寸法|\d+\s*(?:mm|cm|m))/i.test(src)&&/(高さ|幅|奥行|長さ|サイズ|寸法|mm|cm|m)/i.test(s)&&/(置き場所|設置|入るか|収ま|確認|比べ|選)/i.test(s))return true;
  return false;
}
const RISK_TERMS=[
  /疲れ|負担が少|持ち運びやす|軽くて楽|操作が軽|握りやす/i,
  /安心|安全|シャワー|浴室|濡れた手|水洗い|水滴|風呂/i,
  /外出先|旅行先|車内|pc|パソコン|モバイルバッテリー|コンセントがない/i,
  /深剃り|肌に優|すばやく|スムーズ|よく剃|剃りやす/i,
  /味が|味を|おいし|適した|最適|ベスト|安定した|品質が|高性能|高級|丈夫|柔らか/i,
  /保温できる|冷めにく|温かいまま/i,
  /家族|子ども|子供|赤ちゃん|職場|オフィス|学校|通勤|通学|来客|プレゼント|ギフト|キャンプ|屋外|寝室|鍋/i
];
const PROMO_FACT_RE=/(送料無料|クーポン|ポイント|ランキング|最安|激安|限定|セール|sale|no\.?1|第\d+位|受賞)/i;
const IDENTITY_FACT_RE=/^(?:商品|メンズ|レディース|男女兼用|男性用|女性用)$/i;
const FEATURE_HINT_RE=/(?:\d|usb|type-?c|ipx|bluetooth|wi-?fi|防水|充電|対応|折り|収納|温度|設定|調整|耐荷重|容量|サイズ|幅|高さ|奥行|長さ|素材|本革|山羊革|刃|枚|個|本|袋|包|段|色|付属|内蔵|式|可能)/i;
const SAFE_ATOM_RE=/(?:IPX\d+|USB(?:-?C)?(?:充電|対応)?|Type-?C|Bluetooth|Wi-?Fi|約?\s*\d+(?:\.\d+)?\s*(?:mm|cm|m|g|kg|ml|mL|L|W|V|A|Ah|mAh|Wh|Hz|kHz|MHz|GHz|GB|TB|℃|°C|%|枚刃|枚|個|本|台|段|点|色|組|セット))/gi;
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
  const add=(fact,direct=false)=>{
    const cleaned=String(fact||'').trim().replace(/[。！？!?]+$/,'');
    const n=compact(cleaned);
    if(!cleaned||cleaned.length>36||n.length<2||!src.includes(n)||PROMO_FACT_RE.test(cleaned)||IDENTITY_FACT_RE.test(cleaned)||seen.has(n))return;
    if(summary&&(n===summary||summary.includes(n)||n.includes(summary)))return;
    seen.add(n);rows.push({fact:cleaned,direct,score:(direct?2:0)+(FEATURE_HINT_RE.test(cleaned)?3:0)+(/\d/.test(cleaned)?2:0)+(cleaned.length<=18?1:0)});
  };
  for(const raw of Array.isArray(factsUsed)?factsUsed:[]){
    const text=String(raw||'').trim();
    for(const m of text.matchAll(SAFE_ATOM_RE))add(m[0],false);
    add(text,true);
  }
  const sorted=rows.sort((a,b)=>b.score-a.score||Number(b.direct)-Number(a.direct)||b.fact.length-a.fact.length);
  const out=[];
  for(const row of sorted){
    const n=compact(row.fact);
    if(out.some(x=>compact(x).includes(n)||n.includes(compact(x))))continue;
    out.push(row.fact);if(out.length>=4)break;
  }
  return out;
}
function buildGroundedSelectionLine({factsUsed=[],sourceText='',productSummary=''}){
  const facts=groundedFacts(factsUsed,sourceText,productSummary);
  if(facts.length<2)return'';
  const label=String(productSummary||'').trim();
  const subject=label||'この商品';
  return `${subject}は、${facts.join('・')}をまとめて確認できます。仕様を見比べて選びたい時に、比較したい項目が分かりやすい商品です。`;
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
  const thin=safeText.replace(/\s/g,'').length<55||kept.length<2;
  const selectionLine=thin?buildGroundedSelectionLine({factsUsed,sourceText,productSummary}):'';
  if(selectionLine){safeText=[safeText,selectionLine].filter(Boolean).join('\n');reasons.push('append:grounded-selection');}
  return{safe:Boolean(safeText),keepIndices:keep,reasons,postText:safeText,raw:{engine:VERIFIER_MODEL,keep_indices:keep,grounded_selection:Boolean(selectionLine)}};
}

module.exports={VERIFIER_MODEL,splitSentences,bigrams,overlapRatio,allowedDirectBenefit,unsupportedRisk,keepSentence,groundedFacts,buildGroundedSelectionLine,verifyPost};
