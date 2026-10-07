'use strict';

const {getDecisionKnowledge}=require('./product-decision-knowledge');
const {composeGenericFromTitle,composeGenericFromSources}=require('./local-generic-reasoner');
const {selectBestCandidate,shouldPublish}=require('./partner-decision-kernel');

const DISCLOSURE='※アフィリエイト広告を利用しています';

const SAFE_SIGNALS=[
  {term:'温度調節',axes:['温度','温度設定'],intent:'温度を選んで使いたいとき',claim:(id)=>`温度調節に対応した${id}です。`},
  {term:'1℃単位',aliases:['1°C単位'],axes:['温度','温度設定'],intent:'温度を細かく選びたいとき',claim:(id,q)=>`${q}で温度を選べる${id}です。`},
  {term:'保温機能',axes:['保温','保温機能'],intent:'保温機能も見て選びたいとき',claim:(id)=>`保温機能を備えた${id}です。`},
  {term:'スマホ対応',axes:['スマホ','スマホ対応'],intent:'停車中にスマホ操作もしたいとき',claim:(id)=>`スマホ対応の${id}です。`,preserveIntent:true},
  {term:'折りたたみ',axes:['折りたたみ','収納方法'],intent:'使わないときの収納方法も見て選びたいとき',claim:(id)=>`${id}は、使わないときに折りたためます。`},
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
    out.push({kind:'numeric',quote,intent,hook:intent,body,score:4,axes,axis,preserveIntent:false});
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
      body:rule.claim(knowledge.productType,quote),score:8,axes:rule.axes,axis:rule.axes[0]||'仕様',
      preserveIntent:Boolean(rule.preserveIntent)
    });
  }
  return out;
}

function explicitStepAdjustment(itemName='',identity='',itemPrice=0){
  const title=normalize(itemName),id=normalize(identity);
  if(!title||!id||!title.includes(id)) return null;
  const re=/\d+段階(?:調整|調節)/g;
  let match;
  while((match=re.exec(title))){
    const quote=normalize(match[0]);
    const before=title.slice(Math.max(0,match.index-5),match.index);
    const after=title.slice(match.index+match[0].length,match.index+match[0].length+12);
    if(/(?:非|不|未)\s*$/.test(before)||/^\s*(?:ではない|ではありません|非対応|対象外|別売|なし|無し|不要|を除く)/.test(after)) continue;
    const intent='調整段階まで見て選ぶなら';
    const candidate={
      kind:'signal',quote,intent,hook:intent,
      body:`「${quote}」表記の${id}です。`,score:9,axes:['可変構造'],axis:'可変構造',preserveIntent:false
    };
    const best=selectBestCandidate([candidate],{source:title,identity:id});
    if(!best||!shouldPublish(best)) continue;
    const rows=[`${intent}。`,candidate.body];
    if(Number(itemPrice)>0) rows.push('',`価格：${Number(itemPrice).toLocaleString('ja-JP')}円`);
    rows.push('',DISCLOSURE);
    return {
      text:rows.join('\n'),hook:intent,hookType:'scene',quote,axis:'可変構造',kind:'signal',
      decision:best.decision,reasoningVersion:'2026-10-04-explicit-step-adjustment-v1'
    };
  }
  return null;
}

function explicitBatteryPower(itemName='',identity='',itemPrice=0){
  const title=normalize(itemName),id=normalize(identity);
  if(!title||!id||!title.includes(id)) return null;
  const re=/(?:^|[\s【】〖〗（）()「」『』\[\]{}・／/\\|｜,:：;；!！?？★☆※。&＆])(電池式)(?=$|[\s【】〖〗（）()「」『』\[\]{}・／/\\|｜,:：;；!！?？★☆※。&＆])/g;
  const match=re.exec(title);
  if(!match) return null;
  const quote=normalize(match[1]);
  const at=title.indexOf(quote);
  const before=title.slice(Math.max(0,at-5),at);
  const after=title.slice(at+quote.length,at+quote.length+12);
  if(/(?:非|不|未)\s*$/.test(before)||/^\s*(?:ではない|ではありません|非対応|対象外|別売|なし|無し|不要|を除く)/.test(after)) return null;
  const intent='電源方式まで見て選ぶなら';
  const candidate={
    kind:'signal',quote,intent,hook:intent,
    body:`電池式の${id}です。`,score:9,axes:['電源方式'],axis:'電源方式',preserveIntent:false
  };
  const best=selectBestCandidate([candidate],{source:title,identity:id});
  if(!best||!shouldPublish(best)) return null;
  const rows=[`${intent}。`,candidate.body];
  if(Number(itemPrice)>0) rows.push('',`価格：${Number(itemPrice).toLocaleString('ja-JP')}円`);
  rows.push('',DISCLOSURE);
  return {
    text:rows.join('\n'),hook:intent,hookType:'scene',quote,axis:'電源方式',kind:'signal',
    decision:best.decision,reasoningVersion:'2026-10-04-explicit-battery-power-v1'
  };
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

function axisChoicePhrase(best={}){
  const axis=normalize(best.axis);
  if(!axis) return '';
  if(/容量/.test(axis)) return '容量も見て選ぶなら';
  if(/重量/.test(axis)) return '重さも見て選ぶなら';
  if(/サイズ|寸法/.test(axis)) return 'サイズも見て選ぶなら';
  if(/温度/.test(axis)) return '温度設定も見て選ぶなら';
  if(/時間|タイマー/.test(axis)) return '時間設定も見て選ぶなら';
  if(/開閉|収納/.test(axis)) return '開け方や収納方法も見て選ぶなら';
  if(/端子|給電|接続/.test(axis)) return '接続や給電方法も見て選ぶなら';
  if(/キャスター/.test(axis)) return 'キャスターの仕様も見て選ぶなら';
  if(/素材/.test(axis)) return '素材も見て選ぶなら';
  return '';
}

function chooseSituationHook(knowledge,best){
  if(!knowledge||!best||best.preserveIntent) return '';
  const scenes=Array.isArray(knowledge.situations)?knowledge.situations:[];
  const choice=axisChoicePhrase(best);
  if(!choice) return '';
  for(const raw of scenes){
    const scene=normalize(raw).replace(/[。！!]+$/g,'');
    if(!scene) continue;
    const hook=`${scene}、${choice}`;
    const blocked=(knowledge.blockedInferences||[]).some(rule=>{
      const b=normalize(rule);
      return b&&hook.includes(b);
    });
    if(!blocked) return hook;
  }
  return '';
}

function composeLocalPartnerCopy({itemName='',itemCaption='',identity='',itemPrice=0}={}){
  const picked=chooseAngle(itemName,identity);
  if(!picked){
    const explicitAdjustment=explicitStepAdjustment(itemName,identity,itemPrice);
    if(explicitAdjustment){
      return {
        ...explicitAdjustment,
        productType:normalize(identity),
        actsOn:'',
        axisHints:['可変構造'],
        blockedInferences:[],
        generic:true
      };
    }
    const generic=composeGenericFromSources({itemName,itemCaption,identity,itemPrice})||composeGenericFromTitle({itemName,identity,itemPrice});
    if(generic&&normalize(generic.axis)==='サイズ') return null;
    if(generic){
      return {
        ...generic,
        productType:normalize(identity),
        actsOn:'',
        axisHints:[generic.axis],
        blockedInferences:[],
        generic:true
      };
    }
    const battery=explicitBatteryPower(itemName,identity,itemPrice);
    if(battery){
      return {
        ...battery,
        productType:normalize(identity),
        actsOn:'',
        axisHints:['電源方式'],
        blockedInferences:[],
        generic:true
      };
    }
    return null;
  }
  const {knowledge,best}=picked;
  if(best.kind==='numeric'&&normalize(best.axis)==='サイズ') return null;
  const sceneHook=chooseSituationHook(knowledge,best);
  const finalHook=sceneHook||best.intent;
  const rows=[`${finalHook}。`,best.body];
  if(Number(itemPrice)>0) rows.push('',`価格：${Number(itemPrice).toLocaleString('ja-JP')}円`);
  rows.push('',DISCLOSURE);
  return {
    text:rows.join('\n'),
    hook:finalHook,
    hookType:sceneHook?'product_scene':'scene',
    productType:knowledge.productType,
    actsOn:knowledge.actsOn,
    quote:best.quote,
    axisHints:best.axes,
    kind:best.kind,
    decision:{...best.decision,sceneSource:sceneHook?'product_decision_knowledge':'candidate_intent',sceneHook:sceneHook||''},
    reasoningVersion:'2026-10-04-local-scene-composition-v2',
    blockedInferences:knowledge.blockedInferences,
    generic:false
  };
}

module.exports={SAFE_SIGNALS,normalize,hasAxis,axisChoicePhrase,chooseSituationHook,chooseAngle,explicitStepAdjustment,explicitBatteryPower,composeLocalPartnerCopy};