'use strict';

const {getDecisionKnowledge}=require('./product-decision-knowledge');
const {composeGenericFromTitle}=require('./local-generic-reasoner');
const {selectBestCandidate,shouldPublish}=require('./partner-decision-kernel');

const DISCLOSURE='※アフィリエイト広告を利用しています';

const SAFE_SIGNALS=[
  {term:'温度調節',axes:['温度','温度設定'],intent:'温度を選んで使いたいとき',claim:(id)=>`温度調節に対応した${id}です。`},
  {term:'1℃単位',aliases:['1°C単位'],axes:['温度','温度設定'],intent:'温度を細かく選びたいとき',claim:(id,q)=>`${q}で温度を選べる${id}です。`},
  {term:'保温機能',axes:['保温','保温機能'],intent:'保温機能も見て選びたいとき',claim:(id)=>`保温機能を備えた${id}です。`},
  {term:'スマホ対応',axes:['スマホ','スマホ対応'],intent:'停車中にスマホ操作もしたいとき',claim:(id)=>`スマホ対応の${id}です。`},
  {term:'折りたたみ',axes:['折りたたみ','収納方法'],intent:'持ち運びや収納方法も見て選びたいとき',claim:(id)=>`折りたたみ仕様の${id}です。`},
  {term:'タイマー付き',aliases:['タイマー付'],axes:['タイマー','時間設定'],intent:'時間設定も見て選びたいとき',claim:(id,q)=>`${q}の${id}です。`},
  {term:'Type-Cケーブル内蔵',aliases:['type-cケーブル内蔵','USB-Cケーブル内蔵'],axes:['端子','ケーブル内蔵有無','給電構成'],intent:'ケーブルの持ち歩きを減らしたいとき',claim:(id,q)=>`${q}の${id}です。`},
  {term:'フロントオープン',axes:['開閉','収納構造','開閉・収納構造'],intent:'開け方や収納へのアクセスも見て選びたいとき',claim:(id,q)=>`${q}仕様の${id}です。`},
  {term:'キャスターロック',axes:['キャスター'],intent:'キャスターの固定機能も見て選びたいとき',claim:(id,q)=>`${q}付きの${id}です。`},
  {term:'3way',aliases:['3WAY'],axes:['対応作業','装着方式','収納構造'],intent:'使い方を切り替えたいとき',claim:(id,q)=>`${q}仕様の${id}です。`},
  {term:'炭酸対応',axes:['炭酸対応'],intent:'炭酸飲料を持ち歩きたいとき',claim:(id,q)=>`${q}の${id}です。`},
  {term:'ノイズキャンセリング',aliases:['ノイズキャンセリング 2.0','ウルトラノイズキャンセリング'],axes:['ノイズ制御'],intent:'周囲の音を抑える機能も見て選びたいとき',claim:(id,q)=>`${q}対応の${id}です。`}
];

const AXIS_BY_UNIT={
  l:['容量'],ml:['容量'],mah:['容量'],wh:['容量'],gb:['容量'],
  kg:['重量','本体重量'],g:['重量','本体重量'],
  mm:['サイズ','本体サイズ','寸法'],cm:['サイズ','本体サイズ','寸法'],m:['サイズ','本体サイズ','寸法'],
  'インチ':['サイズ','本体サイズ','対応機器'],
  w:['消費電力','出力']
};

function normalize(value=''){
  return String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
}

function hasAxis(knowledge,hints=[]){
  const axes=(knowledge?.decisionAxes||[]).map(normalize);
  return hints.some(h=>axes.some(a=>a.includes(h)||h.includes(a)));
}

function sourceTerm(title,rule){
  const terms=[rule.term,...(rule.aliases||[])];
  const lower=title.toLocaleLowerCase('ja-JP');
  for(const raw of terms){
    const t=normalize(raw);
    const at=lower.indexOf(t.toLocaleLowerCase('ja-JP'));
    if(at>=0) return title.slice(at,at+t.length);
  }
  return '';
}

function numericCandidates(title,knowledge){
  const out=[];
  const re=/(\d+(?:\.\d+)?)\s*(mAh|Wh|W|mm|cm|kg|g|ml|mL|L|GB|インチ)\b/gi;
  let m;
  while((m=re.exec(title))){
    const quote=normalize(m[0]);
    const unit=String(m[2]||'').toLowerCase();
    const axes=AXIS_BY_UNIT[unit]||AXIS_BY_UNIT[m[2]]||[];
    if(!axes.length||!hasAxis(knowledge,axes)) continue;
    const after=title.slice(m.index+m[0].length,m.index+m[0].length+1);
    if(/^[ぁ-んァ-ヶ一-龯]/.test(after)) continue;
    let intent='仕様を見比べて選びたいとき';
    let body=`${quote}の${knowledge.productType}です。`;
    let axis=axes[0]||'数値仕様';
    if(axes.some(x=>x.includes('容量'))){
      intent='使う量や容量を見て選びたいとき';
      body=`${quote}容量の${knowledge.productType}です。`;
      axis='容量';
    }else if(axes.some(x=>x.includes('重量'))){
      intent='重さも見て選びたいとき';
      body=`重さ${quote}の${knowledge.productType}です。`;
      axis='重量';
    }else if(axes.some(x=>x.includes('サイズ')||x.includes('寸法'))){
      intent='サイズも確認して選びたいとき';
      body=`${quote}のサイズ表記がある${knowledge.productType}です。`;
      axis='サイズ';
    }else if(axes.some(x=>x.includes('出力')||x.includes('消費電力'))){
      intent='電力仕様も確認して選びたいとき';
      body=`${quote}表記の${knowledge.productType}です。`;
      axis='電力仕様';
    }
    out.push({kind:'numeric',quote,intent,hook:intent,body,score:4,axes,axis});
  }
  return out;
}

function signalCandidates(title,knowledge){
  const out=[];
  for(const rule of SAFE_SIGNALS){
    if(!hasAxis(knowledge,rule.axes)) continue;
    const quote=sourceTerm(title,rule);
    if(!quote) continue;
    out.push({
      kind:'signal',quote,intent:rule.intent,hook:rule.intent,
      body:rule.claim(knowledge.productType,quote),score:8,axes:rule.axes,axis:rule.axes[0]||'仕様'
    });
  }
  return out;
}

function chooseAngle(itemName='',identity=''){
  const title=normalize(itemName);
  const exactIdentity=normalize(identity);
  const knowledge=getDecisionKnowledge(exactIdentity);
  if(!title||!knowledge) return null;
  if(normalize(knowledge.productType)!==exactIdentity) return null;
  if(!title.includes(exactIdentity)) return null;

  const candidates=[...signalCandidates(title,knowledge),...numericCandidates(title,knowledge)];
  const best=selectBestCandidate(candidates,{
    source:title,
    identity:exactIdentity,
    decisionAxes:knowledge.decisionAxes,
    situations:knowledge.situations,
    blockedInferences:knowledge.blockedInferences
  });
  if(!best||!shouldPublish(best)) return null;
  return {knowledge,best};
}

function composeLocalPartnerCopy({itemName='',identity='',itemPrice=0}={}){
  const picked=chooseAngle(itemName,identity);
  if(!picked){
    const generic=composeGenericFromTitle({itemName,identity,itemPrice});
    if(!generic) return null;
    return {
      ...generic,
      productType:normalize(identity),
      actsOn:'',
      axisHints:[generic.axis],
      blockedInferences:[],
      generic:true
    };
  }
  const {knowledge,best}=picked;
  const hook=`${best.intent}。`;
  const rows=[hook,best.body];
  if(Number(itemPrice)>0) rows.push('',`価格：${Number(itemPrice).toLocaleString('ja-JP')}円`);
  rows.push('',DISCLOSURE);
  return {
    text:rows.join('\n'),
    hook:best.intent,
    hookType:'scene',
    productType:knowledge.productType,
    actsOn:knowledge.actsOn,
    quote:best.quote,
    axisHints:best.axes,
    kind:best.kind,
    decision:best.decision,
    reasoningVersion:'2026-10-04-partner-decision-kernel-v2',
    blockedInferences:knowledge.blockedInferences,
    generic:false
  };
}

module.exports={SAFE_SIGNALS,normalize,hasAxis,chooseAngle,composeLocalPartnerCopy};
