'use strict';

function normalize(value=''){
  return String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
}

function sourceHasExact(source='',quote=''){
  const s=normalize(source).toLocaleLowerCase('ja-JP');
  const q=normalize(quote).toLocaleLowerCase('ja-JP');
  return Boolean(s&&q&&s.includes(q));
}

function normalizeList(values=[]){
  return (Array.isArray(values)?values:[]).map(normalize).filter(Boolean);
}

function textIncludesEither(a='',b=''){
  const x=normalize(a).toLocaleLowerCase('ja-JP');
  const y=normalize(b).toLocaleLowerCase('ja-JP');
  return Boolean(x&&y&&(x.includes(y)||y.includes(x)));
}

function isWeakGeneric(candidate={}){
  const axis=normalize(candidate.axis);
  return ['生産情報','電力仕様','数値仕様'].includes(axis);
}

function axisFamily(candidate={}){
  const axis=normalize(candidate.axis);
  const groups=[
    ['adjustability',['可変構造','可変範囲','高さ調整','角度調整','温度','温度設定','時間設定']],
    ['maintenance',['お手入れ']],
    ['installation',['設置・構造','収納形態','収納構造','開閉']],
    ['control',['操作方法','接続方式','端子','ノイズ制御']],
    ['capacity',['容量','サイズ','本体サイズ','寸法']],
    ['material',['素材・構造']],
    ['environment',['炭酸対応','仕様']],
    ['generic',['生産情報','電力仕様','数値仕様']]
  ];
  for(const [family,axes] of groups){
    if(axes.some(x=>textIncludesEither(axis,x))) return family;
  }
  return 'other';
}

function purchaseImpactBonus(candidate={}){
  const family=axisFamily(candidate);
  if(family==='adjustability') return 5;
  if(family==='maintenance') return 4;
  if(family==='installation') return 3;
  if(family==='control') return 3;
  if(family==='capacity') return 2;
  if(family==='environment') return 2;
  if(family==='material') return 1;
  return 0;
}

function isConcreteActionable(candidate={}){
  return ['adjustability','maintenance','installation','control','capacity','environment'].includes(axisFamily(candidate));
}

function matchesDecisionAxis(candidate={},context={}){
  const axis=normalize(candidate.axis);
  const axes=normalizeList(context.decisionAxes);
  if(!axis||!axes.length) return false;
  return axes.some(a=>textIncludesEither(axis,a));
}

const CLICHE_PATTERNS=[
  /毎日をもっと/i,/暮らしを(?:もっと)?快適/i,/便利なアイテム/i,/おすすめです/i,/大活躍/i,/これ一つで/i,/手放せない/i,/マストアイテム/i
];

function clichePenalty(candidate={}){
  const text=[candidate.hook,candidate.intent,candidate.body].map(normalize).join(' ');
  return CLICHE_PATTERNS.some(re=>re.test(text))?4:0;
}

function blockedInferencePenalty(candidate={},context={}){
  const text=[candidate.hook,candidate.intent,candidate.body].map(normalize).join(' ').toLocaleLowerCase('ja-JP');
  if(!text) return 0;
  for(const raw of normalizeList(context.blockedInferences)){
    const blocked=raw.toLocaleLowerCase('ja-JP');
    if(blocked.length>=4&&(text.includes(blocked)||blocked.includes(text))) return 100;
  }
  return 0;
}

function riskPenalty(candidate={},source='',context={}){
  const quote=normalize(candidate.quote);
  if(!quote||!sourceHasExact(source,quote)) return 100;
  const s=normalize(source);
  const at=s.toLocaleLowerCase('ja-JP').indexOf(quote.toLocaleLowerCase('ja-JP'));
  if(at<0) return 100;
  const before=s.slice(Math.max(0,at-8),at);
  const after=s.slice(at+quote.length,at+quote.length+16);
  if(/(?:非|不|未)\s*$/.test(before)) return 100;
  if(/^\s*(?:ではない|ではありません|非対応|対象外|別売|なし|無し|不要|を除く)/.test(after)) return 100;
  return blockedInferencePenalty(candidate,context);
}

function specificityBonus(candidate={}){
  const quote=normalize(candidate.quote);
  if(!quote) return 0;
  if(/[0-9]/.test(quote)&&/[A-Za-z℃°%]|(?:ml|L|cm|mm|kg|g|mAh|Wh|GB|インチ)/i.test(quote)) return 1;
  if(quote.length>=6) return 2;
  if(quote.length>=4) return 1;
  return 0;
}

function sourceProximityBonus(candidate={},context={}){
  const source=normalize(context.source||'').toLocaleLowerCase('ja-JP');
  const identity=normalize(context.identity||'').toLocaleLowerCase('ja-JP');
  const quote=normalize(candidate.quote).toLocaleLowerCase('ja-JP');
  if(!source||!identity||!quote) return 0;
  const i=source.indexOf(identity),q=source.indexOf(quote);
  if(i<0||q<0) return 0;
  const distance=Math.abs(i-q);
  if(distance<=20) return 2;
  if(distance<=50) return 1;
  return 0;
}

function scoreCandidate(candidate={},context={}){
  const source=normalize(context.source||'');
  const identity=normalize(context.identity||'');
  if(!candidate||!candidate.quote||!sourceHasExact(source,candidate.quote)) return -Infinity;
  let score=Number(candidate.score)||0;
  score-=riskPenalty(candidate,source,context);
  if(!Number.isFinite(score)||score<0) return -Infinity;

  if(candidate.kind==='signal') score+=4;
  if(isConcreteActionable(candidate)) score+=3;
  if(matchesDecisionAxis(candidate,context)) score+=3;
  if(isWeakGeneric(candidate)) score-=3;
  if(identity&&normalize(candidate.body).includes(identity)) score+=2;
  score+=purchaseImpactBonus(candidate);
  score+=specificityBonus(candidate);
  score+=sourceProximityBonus(candidate,context);
  score-=clichePenalty(candidate);
  return score;
}

function corroborationBonus(candidate={},evaluatedCandidates=[]){
  const family=axisFamily(candidate);
  if(!['adjustability','maintenance','installation','control'].includes(family)) return 0;
  const quote=normalize(candidate.quote).toLocaleLowerCase('ja-JP');
  const support=(Array.isArray(evaluatedCandidates)?evaluatedCandidates:[]).filter(other=>{
    if(!other||other===candidate) return false;
    if(axisFamily(other)!==family) return false;
    const oq=normalize(other.quote).toLocaleLowerCase('ja-JP');
    return Boolean(oq&&oq!==quote);
  });
  return support.length?2:0;
}

function selectBestCandidate(candidates=[],context={}){
  const usable=(Array.isArray(candidates)?candidates:[]).filter(Boolean);
  const evaluated=usable
    .map((candidate,index)=>{
      const baseScore=scoreCandidate(candidate,context);
      const corroboration=Number.isFinite(baseScore)?corroborationBonus(candidate,usable):0;
      return {candidate,index,baseScore,corroboration,score:Number.isFinite(baseScore)?baseScore+corroboration:-Infinity};
    })
    .filter(x=>Number.isFinite(x.score))
    .sort((a,b)=>b.score-a.score||b.baseScore-a.baseScore||a.index-b.index);
  if(!evaluated.length) return null;

  const best=evaluated[0];
  const second=evaluated[1]||null;
  const margin=second?best.score-second.score:best.score;
  const confidence=best.score>=18&&(!second||margin>=2)?'high':best.score>=12?'medium':'low';
  return {
    ...best.candidate,
    decision:{
      score:best.score,
      baseScore:best.baseScore,
      purchaseImpactBonus:purchaseImpactBonus(best.candidate),
      corroborationBonus:best.corroboration,
      family:axisFamily(best.candidate),
      runnerUpScore:second?.score??null,
      margin:second?margin:null,
      confidence,
      evaluatedCount:evaluated.length,
      runnerUpQuote:second?.candidate?.quote||'',
      principles:[
        'source_exact','accuracy_first','compare_multiple_candidates','prefer_concrete_purchase_axis',
        'prefer_high_purchase_impact','reward_independent_corroboration','match_product_decision_axes',
        'avoid_blocked_inference','avoid_cliche_wording','defer_when_uncertain'
      ]
    }
  };
}

function shouldPublish(candidate){
  if(!candidate?.decision) return false;
  if(candidate.decision.confidence==='low') return false;
  if(isWeakGeneric(candidate)&&candidate.decision.confidence!=='high') return false;
  return true;
}

module.exports={
  normalize,sourceHasExact,isWeakGeneric,axisFamily,purchaseImpactBonus,isConcreteActionable,matchesDecisionAxis,clichePenalty,
  blockedInferencePenalty,riskPenalty,specificityBonus,sourceProximityBonus,scoreCandidate,corroborationBonus,selectBestCandidate,shouldPublish
};
