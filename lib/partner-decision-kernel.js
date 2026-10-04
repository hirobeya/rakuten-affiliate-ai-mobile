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
  if(family==='adjustability') return 6;
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

function writingQuality(candidate={},context={}){
  const hook=normalize(candidate.hook||candidate.intent);
  const body=normalize(candidate.body);
  const identity=normalize(context.identity||'');
  const quote=normalize(candidate.quote);
  let score=100;
  const reasons=[];

  if(!hook){score-=20;reasons.push('missing_hook');}
  if(!body){score-=30;reasons.push('missing_body');}
  if(identity&&body&&!body.includes(identity)){score-=20;reasons.push('identity_missing_from_body');}
  if(clichePenalty(candidate)>0){score-=25;reasons.push('cliche');}
  if(hook&&body&&hook===body){score-=25;reasons.push('hook_body_duplicate');}
  if(hook.length>48){score-=10;reasons.push('hook_too_long');}
  if(body.length>72){score-=10;reasons.push('body_too_long');}

  const id=identity.toLocaleLowerCase('ja-JP');
  const q=quote.toLocaleLowerCase('ja-JP');
  if(id&&q&&id.includes(q)&&body.includes(`${quote}仕様の${identity}`)){
    score-=18;
    reasons.push('tautology');
  }
  if(/(?:確認して選びたいとき|見て選びたいとき).*(?:確認して選びたいとき|見て選びたいとき)/.test(`${hook} ${body}`)){
    score-=12;
    reasons.push('repetitive_choice_phrase');
  }

  score=Math.max(0,Math.min(100,score));
  const confidence=score>=85?'high':score>=65?'medium':'low';
  return {score,confidence,reasons};
}

function qualityBonus(candidate={},context={}){
  const q=writingQuality(candidate,context);
  if(q.score>=90) return 2;
  if(q.score>=80) return 1;
  if(q.score>=65) return 0;
  if(q.score>=50) return -1;
  return -3;
}

function evaluateCandidate(candidate={},context={}){
  const source=normalize(context.source||'');
  const identity=normalize(context.identity||'');
  const risk=riskPenalty(candidate,source,context);
  const exact=Boolean(candidate?.quote&&sourceHasExact(source,candidate.quote));
  const safetyScore=exact&&risk===0?100:0;
  if(safetyScore===0){
    return {
      publishable:false,
      safetyScore,
      safetyConfidence:'blocked',
      persuasionScore:-Infinity,
      writingQuality:writingQuality(candidate,context),
      family:axisFamily(candidate),
      components:{riskPenalty:risk}
    };
  }

  const components={
    base:Number(candidate.score)||0,
    signal:candidate.kind==='signal'?4:0,
    concrete:isConcreteActionable(candidate)?3:0,
    decisionAxis:matchesDecisionAxis(candidate,context)?3:0,
    weakGeneric:isWeakGeneric(candidate)?-3:0,
    identity:identity&&normalize(candidate.body).includes(identity)?2:0,
    purchaseImpact:purchaseImpactBonus(candidate),
    specificity:specificityBonus(candidate),
    sourceProximity:sourceProximityBonus(candidate,context),
    cliche:-clichePenalty(candidate)
  };
  const persuasionScore=Object.values(components).reduce((sum,value)=>sum+(Number(value)||0),0);
  const quality=writingQuality(candidate,context);
  return {
    publishable:Number.isFinite(persuasionScore)&&persuasionScore>=0&&quality.score>=50,
    safetyScore,
    safetyConfidence:'high',
    persuasionScore,
    writingQuality:quality,
    family:axisFamily(candidate),
    components
  };
}

function scoreCandidate(candidate={},context={}){
  const evaluated=evaluateCandidate(candidate,context);
  return evaluated.publishable?evaluated.persuasionScore+qualityBonus(candidate,context):-Infinity;
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

function diverseAlternatives(evaluated=[],limit=3){
  const rows=Array.isArray(evaluated)?evaluated:[];
  const chosen=[];
  const usedFamilies=new Set();
  for(const row of rows){
    const family=row.assessment.family;
    if(usedFamilies.has(family)) continue;
    chosen.push(row);
    usedFamilies.add(family);
    if(chosen.length>=limit) return chosen;
  }
  for(const row of rows){
    if(chosen.includes(row)) continue;
    chosen.push(row);
    if(chosen.length>=limit) break;
  }
  return chosen;
}

function selectBestCandidate(candidates=[],context={}){
  const usable=(Array.isArray(candidates)?candidates:[]).filter(Boolean);
  const evaluated=usable
    .map((candidate,index)=>{
      const assessment=evaluateCandidate(candidate,context);
      const corroboration=assessment.publishable?corroborationBonus(candidate,usable):0;
      const quality=assessment.publishable?qualityBonus(candidate,context):0;
      const persuasionScore=assessment.publishable?assessment.persuasionScore+corroboration:-Infinity;
      const totalScore=assessment.publishable?persuasionScore+quality:-Infinity;
      return {candidate,index,assessment,corroboration,quality,persuasionScore,totalScore};
    })
    .filter(x=>x.assessment.publishable&&Number.isFinite(x.totalScore))
    .sort((a,b)=>b.totalScore-a.totalScore||b.persuasionScore-a.persuasionScore||a.index-b.index);
  if(!evaluated.length) return null;

  const best=evaluated[0];
  const second=evaluated[1]||null;
  const margin=second?best.totalScore-second.totalScore:best.totalScore;
  const confidence=best.totalScore>=18&&(!second||margin>=2)?'high':best.totalScore>=12?'medium':'low';
  const diverse=diverseAlternatives(evaluated,3);
  const alternatives=diverse.map(row=>({
    quote:normalize(row.candidate.quote),
    axis:normalize(row.candidate.axis),
    family:row.assessment.family,
    safetyScore:row.assessment.safetyScore,
    persuasionScore:row.persuasionScore,
    qualityScore:row.assessment.writingQuality.score,
    totalScore:row.totalScore
  }));

  return {
    ...best.candidate,
    decision:{
      score:best.totalScore,
      totalScore:best.totalScore,
      safetyScore:best.assessment.safetyScore,
      safetyConfidence:best.assessment.safetyConfidence,
      persuasionScore:best.persuasionScore,
      persuasionBaseScore:best.assessment.persuasionScore,
      persuasionComponents:best.assessment.components,
      writingQualityScore:best.assessment.writingQuality.score,
      writingQualityConfidence:best.assessment.writingQuality.confidence,
      writingQualityReasons:best.assessment.writingQuality.reasons,
      qualityBonus:best.quality,
      purchaseImpactBonus:purchaseImpactBonus(best.candidate),
      corroborationBonus:best.corroboration,
      family:best.assessment.family,
      runnerUpScore:second?.totalScore??null,
      runnerUpPersuasionScore:second?.persuasionScore??null,
      runnerUpSafetyScore:second?.assessment?.safetyScore??null,
      margin:second?margin:null,
      confidence,
      evaluatedCount:evaluated.length,
      runnerUpQuote:second?.candidate?.quote||'',
      alternatives,
      diversityFamilies:[...new Set(alternatives.map(x=>x.family))],
      principles:[
        'safety_before_persuasion','source_exact','accuracy_first','compare_multiple_candidates','preserve_candidate_diversity',
        'self_score_writing_quality','prefer_concrete_purchase_axis','prefer_high_purchase_impact','reward_independent_corroboration',
        'match_product_decision_axes','avoid_blocked_inference','avoid_cliche_wording','defer_when_uncertain'
      ]
    }
  };
}

function shouldPublish(candidate){
  if(!candidate?.decision) return false;
  if(candidate.decision.safetyConfidence!=='high'||candidate.decision.safetyScore<100) return false;
  if(candidate.decision.writingQualityScore<50) return false;
  if(candidate.decision.confidence==='low') return false;
  if(isWeakGeneric(candidate)&&candidate.decision.confidence!=='high') return false;
  return true;
}

module.exports={
  normalize,sourceHasExact,isWeakGeneric,axisFamily,purchaseImpactBonus,isConcreteActionable,matchesDecisionAxis,clichePenalty,
  blockedInferencePenalty,riskPenalty,specificityBonus,sourceProximityBonus,writingQuality,qualityBonus,evaluateCandidate,scoreCandidate,
  corroborationBonus,diverseAlternatives,selectBestCandidate,shouldPublish
};
