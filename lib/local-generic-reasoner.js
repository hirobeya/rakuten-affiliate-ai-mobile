'use strict';

const {selectBestCandidate,shouldPublish,axisFamily}=require('./partner-decision-kernel');

const DISCLOSURE='※アフィリエイト広告を利用しています';

function normalize(value=''){
  return String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
}

function identityContainsFeature(identity='',quote=''){
  const id=normalize(identity).toLocaleLowerCase('ja-JP');
  const q=normalize(quote).toLocaleLowerCase('ja-JP');
  if(!id||!q) return false;
  if(id.includes(q)) return true;
  const variants={
    '折りたたみ':['折り畳み'],
    '折り畳み':['折りたたみ'],
    '伸縮式':['伸縮'],
    '伸縮':['伸縮式']
  };
  return (variants[q]||[]).some(v=>id.includes(v));
}

function foldBody(identity='',quote=''){
  const id=normalize(identity),q=normalize(quote);
  if(identityContainsFeature(id,q)) return `${id}です。`;
  return `${q}できる${id}です。`;
}

function extendBody(identity='',quote=''){
  const id=normalize(identity),q=normalize(quote);
  if(identityContainsFeature(id,q)) return `${id}です。`;
  if(q==='伸縮式') return `伸縮式の${id}です。`;
  return `伸縮タイプの${id}です。`;
}

function materialBody(identity='',quote=''){
  const id=normalize(identity),q=normalize(quote);
  if(q==='木製') return `木製の${id}です。`;
  if(['ステンレス','シリコン','アルミ','アルミニウム','ガラス','セラミック'].includes(q)) return `${q}製の${id}です。`;
  if(['本革','レザー'].includes(q)) return `${q}を使った${id}です。`;
  if(['メッシュ','ナイロン','ポリエステル','コットン','綿'].includes(q)) return `${q}素材の${id}です。`;
  return `${q}を使った${id}です。`;
}

const SIGNALS=[
  {terms:['伸縮式','伸縮'],axis:'可変構造',hook:'長さを変えて使いたいなら',body:(id,q)=>extendBody(id,q),score:11},
  {terms:['高さ調整','高さ調節'],axis:'高さ調整',hook:'高さを変えて使いたいなら',body:(id,q)=>`${q}に対応した${id}です。`,score:11},
  {terms:['角度調整','角度調節'],axis:'角度調整',hook:'角度を変えて使いたいなら',body:(id,q)=>`${q}に対応した${id}です。`,score:11},
  {terms:['リモコン付き','リモコン付'],axis:'操作方法',hook:'操作方法まで見て選ぶなら',body:(id,q)=>`${q}の${id}です。`,score:10},
  {terms:['三脚一体型','三脚付き'],axis:'設置・構造',hook:'置き方や設置方法まで見て選ぶなら',body:(id,q)=>`${q}の${id}です。`,score:10},
  {terms:['折りたたみ','折り畳み'],axis:'収納形態',hook:'折りたためる形で選びたいなら',body:(id,q)=>foldBody(id,q),score:10},
  {terms:['食洗機対応'],axis:'お手入れ',hook:'食洗機対応で選びたいなら',body:(id,q)=>`${q}の${id}です。`,score:10},
  {terms:['洗える'],axis:'お手入れ',hook:'洗えるタイプで選びたいなら',body:(id,q)=>`${q}${id}です。`,score:10},
  {terms:['USB-C対応','USB-C','Type-C対応','Type-C'],axis:'端子',hook:'接続端子まで見て選ぶなら',body:(id,q)=>`${q}表記の${id}です。`,score:9},
  {terms:['Bluetooth対応','Bluetooth'],axis:'接続方式',hook:'接続方式まで見て選ぶなら',body:(id,q)=>`${q}表記の${id}です。`,score:9},
  {terms:['防水','撥水'],axis:'仕様',hook:'使う環境に関わる仕様まで見て選ぶなら',body:(id,q)=>`${q}仕様の${id}です。`,score:8},
  {terms:['メッシュ','ステンレス','シリコン','アルミ','アルミニウム','木製','ガラス','セラミック','本革','レザー','ナイロン','ポリエステル','コットン','綿'],axis:'素材・構造',hook:'素材まで見て選ぶなら',body:(id,q)=>materialBody(id,q),score:7},
  {terms:['キャスター付き','マグネット式','壁掛け','粘着式'],axis:'設置・構造',hook:'設置方法まで見て選ぶなら',body:(id,q)=>`${q}の${id}です。`,score:7},
  {terms:['日本製'],axis:'生産情報',hook:'生産情報まで見て選ぶなら',body:(id,q)=>`${q}の${id}です。`,score:3}
];

function labeledMeta(quote=''){
  const q=normalize(quote);
  if(/^(?:容量|内容量)\s*[:：]?\s*\d+(?:\.\d+)?\s*(?:ml|mL|L)$/i.test(q)){
    return {axis:'容量',hook:'容量まで見て選ぶなら',body:(id)=>`${q}表記の${id}です。`,score:9,kind:'signal'};
  }
  if(/^(?:高さ|幅|奥行|奥行き|長さ|直径)\s*[:：]?\s*\d+(?:\.\d+)?\s*(?:mm|cm|m)$/i.test(q)){
    return {axis:'サイズ',hook:'サイズまで見て選ぶなら',body:(id)=>`${q}表記の${id}です。`,score:9,kind:'signal'};
  }
  if(/^(?:重量|質量|重さ)\s*[:：]?\s*\d+(?:\.\d+)?\s*(?:mg|g|kg)$/i.test(q)){
    return {axis:'重量',hook:'重さまで見て選ぶなら',body:(id)=>`${q}表記の${id}です。`,score:8,kind:'signal'};
  }
  return null;
}

function numericMeta(quote=''){
  const q=normalize(quote);
  if(/^最大\s*\d+(?:\.\d+)?\s*(?:mm|cm|m)$/i.test(q)) return {axis:'可変範囲',hook:'長さの上限まで見て選ぶなら',body:(id)=>`${q}表記の${id}です。`,score:8};
  if(/^\d+(?:\.\d+)?\s*(?:mm|cm|m)(?:[×xX]\d+(?:\.\d+)?\s*(?:mm|cm|m)){1,2}$/i.test(q)) return {axis:'サイズ',hook:'サイズまで見て選ぶなら',body:(id)=>`${q}表記の${id}です。`,score:7};
  if(/^\d+(?:枚|個|本|袋|組|点|粒|錠|箱|足)(?:入り|入|セット|組)?$/.test(q)) return {axis:'入り数',hook:'入り数まで見て選ぶなら',body:(id)=>`${q}の${id}です。`,score:6};
  if(/^\d+(?:\.\d+)?\s*(?:mAh|Ah|Wh|W|V|A|mm|cm|m|kg|mg|g|ml|mL|L|GB|インチ)$/i.test(q)) return {axis:'数値仕様',hook:'数値仕様まで見て選ぶなら',body:(id)=>`${q}表記の${id}です。`,score:4};
  return null;
}

function candidateFromFact(fact,identity){
  const quote=normalize(fact?.quote);
  if(!quote) return null;
  for(const rule of SIGNALS){
    if(rule.terms.includes(quote)) return {quote,axis:rule.axis,hook:rule.hook,body:rule.body(identity,quote),score:rule.score,kind:'signal'};
  }
  const labeled=labeledMeta(quote);
  if(labeled) return {quote,axis:labeled.axis,hook:labeled.hook,body:labeled.body(identity),score:labeled.score,kind:labeled.kind};
  const numeric=numericMeta(quote);
  if(numeric) return {quote,axis:numeric.axis,hook:numeric.hook,body:numeric.body(identity),score:numeric.score,kind:'numeric'};
  return null;
}

function safeTitleFacts(itemName=''){
  const title=normalize(itemName);
  if(!title) return [];
  const out=[];
  const push=quote=>{const q=normalize(quote);if(q&&!out.some(x=>x.quote.toLowerCase()===q.toLowerCase())) out.push({quote:q,source:'itemName'});};
  for(const rule of SIGNALS){
    for(const term of rule.terms){
      const at=title.toLocaleLowerCase('ja-JP').indexOf(term.toLocaleLowerCase('ja-JP'));
      if(at<0) continue;
      const before=title.slice(Math.max(0,at-5),at);
      const after=title.slice(at+term.length,at+term.length+10);
      if(/(?:非|不|未)\s*$/.test(before)||/^(?:\s*(?:ではない|ではありません|非対応|不要|なし|無し|別売|を除く|対象外))/.test(after)) continue;
      push(title.slice(at,at+term.length));
      break;
    }
  }
  const labeledPatterns=[
    /(?:容量|内容量)\s*[:：]?\s*\d+(?:\.\d+)?\s*(?:ml|mL|L)/gi,
    /(?:高さ|幅|奥行|奥行き|長さ|直径)\s*[:：]?\s*\d+(?:\.\d+)?\s*(?:mm|cm|m)/gi,
    /(?:重量|質量|重さ)\s*[:：]?\s*\d+(?:\.\d+)?\s*(?:mg|g|kg)/gi
  ];
  for(const re of labeledPatterns){
    let match;
    while((match=re.exec(title))){
      const q=normalize(match[0]);
      if(labeledMeta(q)) push(q);
    }
  }
  const patterns=[
    /最大\s*\d+(?:\.\d+)?\s*(?:mm|cm|m)/gi,
    /\d+(?:\.\d+)?\s*(?:mm|cm|m)[×xX]\d+(?:\.\d+)?\s*(?:mm|cm|m)(?:[×xX]\d+(?:\.\d+)?\s*(?:mm|cm|m))?/gi,
    /\d+(?:\.\d+)?\s*(?:mAh|Ah|Wh|W|V|A|mm|cm|kg|mg|g|ml|mL|L|GB|インチ)/gi,
    /\d+(?:枚|個|本|袋|組|点|粒|錠|箱|足)(?:入り|入|セット|組)?/g
  ];
  for(const re of patterns){
    let match;
    while((match=re.exec(title))){
      const q=normalize(match[0]);
      const start=match.index,end=start+match[0].length;
      const before=title.slice(Math.max(0,start-1),start),after=title.slice(end,end+1);
      if(/[0-9０-９A-Za-z.,，_+×xX-]$/.test(before)||/^[0-9０-９A-Za-z×xX]/.test(after)) continue;
      if(/^[ぁ-んァ-ヶ一-龯]/.test(after)) continue;
      if(numericMeta(q)) push(q);
    }
  }
  return out;
}

function meaningBundle(best,candidates=[]){
  if(!best) return null;
  const family=axisFamily(best);
  const supportQuotes=[...new Set((Array.isArray(candidates)?candidates:[]).filter(c=>c&&axisFamily(c)===family).map(c=>normalize(c.quote)).filter(Boolean))];
  return {family,primaryQuote:normalize(best.quote),supportQuotes,evidenceCount:supportQuotes.length,integrated:supportQuotes.length>1};
}

function buildFamilyHypotheses(candidates=[],context={}){
  const groups=new Map();
  for(const candidate of Array.isArray(candidates)?candidates:[]){
    if(!candidate) continue;
    const family=axisFamily(candidate);
    if(!groups.has(family)) groups.set(family,[]);
    groups.get(family).push(candidate);
  }
  const rows=[];
  for(const [family,group] of groups.entries()){
    const winner=selectBestCandidate(group,context);
    if(!winner||!winner.decision) continue;
    rows.push({
      family,
      quote:normalize(winner.quote),
      axis:normalize(winner.axis),
      score:Number(winner.decision.totalScore??winner.decision.score??0),
      confidence:winner.decision.confidence,
      purchaseImpact:Number(winner.decision.purchaseImpactBonus||0),
      supportCount:group.length,
      supportQuotes:[...new Set(group.map(x=>normalize(x.quote)).filter(Boolean))],
      decisionAxisMatched:Boolean(winner.decision?.persuasionComponents?.decisionAxis)
    });
  }
  rows.sort((a,b)=>b.score-a.score||b.purchaseImpact-a.purchaseImpact||b.supportCount-a.supportCount||a.family.localeCompare(b.family,'ja'));
  return rows;
}

function resolveCompetingHypotheses(candidates=[],context={}){
  const rows=buildFamilyHypotheses(candidates,context);
  if(!rows.length) return {status:'none',winner:null,runnerUp:null,margin:null,hypotheses:[]};
  const winner=rows[0],runnerUp=rows[1]||null;
  if(!runnerUp) return {status:'clear',winner,runnerUp:null,margin:null,hypotheses:rows};
  const margin=winner.score-runnerUp.score;
  const strongerEvidence=winner.supportCount>runnerUp.supportCount;
  const decisionAxisLead=winner.decisionAxisMatched&&!runnerUp.decisionAxisMatched;
  const impactLead=margin>=1&&winner.purchaseImpact>runnerUp.purchaseImpact;
  const status=(margin>=2||strongerEvidence||decisionAxisLead||impactLead)?'clear':'close';
  return {status,winner,runnerUp,margin,hypotheses:rows};
}

function semanticProfile(candidates=[],context={}){
  const hypotheses=buildFamilyHypotheses(candidates,context);
  if(!hypotheses.length) return {status:'none',dominantFamily:'',secondaryFamilies:[],evidenceCount:0,breadth:0};
  const dominant=hypotheses[0];
  const runnerUp=hypotheses[1]||null;
  const resolution=resolveCompetingHypotheses(candidates,context);
  return {
    status:resolution.status,
    dominantFamily:dominant.family,
    dominantAxis:dominant.axis,
    dominantQuote:dominant.quote,
    secondaryFamilies:hypotheses.slice(1,4).map(x=>x.family),
    evidenceCount:hypotheses.reduce((sum,x)=>sum+x.supportCount,0),
    breadth:hypotheses.length,
    margin:runnerUp?dominant.score-runnerUp.score:null,
    hypotheses
  };
}

function corroboratingCandidate(best,candidates=[]){
  if(!best) return null;
  const family=axisFamily(best);
  if(family!=='adjustability') return null;
  const others=(Array.isArray(candidates)?candidates:[]).filter(c=>c&&c!==best&&axisFamily(c)===family&&normalize(c.quote)!==normalize(best.quote));
  if(!others.length) return null;
  if(best.axis==='可変範囲') return others.find(c=>['可変構造','高さ調整','角度調整'].includes(c.axis))||null;
  if(['可変構造','高さ調整','角度調整'].includes(best.axis)) return others.find(c=>c.axis==='可変範囲')||null;
  return null;
}

function groundedBody(best,candidates,id){
  const support=corroboratingCandidate(best,candidates);
  if(!support) return {body:best.body,supportQuote:''};
  const structural=best.axis==='可変範囲'?support:best;
  const range=best.axis==='可変範囲'?best:support;
  return {body:`${structural.quote}で、${range.quote}表記の${id}です。`,supportQuote:range.quote===best.quote?structural.quote:range.quote};
}

function composeGenericLocalCopy({identity='',facts=[],itemPrice=0,itemName=''}={}){
  const id=normalize(identity);
  if(!id||!Array.isArray(facts)||!facts.length) return null;
  const candidates=facts.map(f=>candidateFromFact(f,id)).filter(Boolean);
  const source=normalize(itemName)||facts.map(f=>normalize(f?.quote)).filter(Boolean).join(' ');
  const context={source,identity:id};
  const best=selectBestCandidate(candidates,context);
  if(!best||!shouldPublish(best)) return null;
  const hypothesis=resolveCompetingHypotheses(candidates,context);
  if(hypothesis.status==='close') return null;
  if(best.quote==='日本製'&&candidates.length===1) return null;
  const grounded=groundedBody(best,candidates,id),bundle=meaningBundle(best,candidates),profile=semanticProfile(candidates,context);
  const rows=[best.hook+'。',grounded.body];
  if(Number(itemPrice)>0) rows.push('',`価格：${Number(itemPrice).toLocaleString('ja-JP')}円`);
  rows.push('',DISCLOSURE);
  return {
    text:rows.join('\n'),hook:best.hook,hookType:'scene',quote:best.quote,supportQuote:grounded.supportQuote,
    axis:best.axis,kind:best.kind,
    decision:{...best.decision,meaningBundle:bundle,semanticProfile:profile,hypothesisStatus:hypothesis.status,hypothesisMargin:hypothesis.margin,hypotheses:hypothesis.hypotheses},
    reasoningVersion:'2026-10-04-purchase-reason-operators-v5'
  };
}

function composeGenericFromTitle({itemName='',identity='',itemPrice=0}={}){
  const facts=safeTitleFacts(itemName);
  return composeGenericLocalCopy({identity,facts,itemPrice,itemName});
}

module.exports={
  normalize,identityContainsFeature,foldBody,extendBody,materialBody,labeledMeta,numericMeta,candidateFromFact,safeTitleFacts,
  meaningBundle,buildFamilyHypotheses,resolveCompetingHypotheses,semanticProfile,corroboratingCandidate,groundedBody,composeGenericLocalCopy,composeGenericFromTitle
};
