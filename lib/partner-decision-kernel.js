'use strict';

function normalize(value=''){
  return String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
}

function sourceHasExact(source='',quote=''){
  const s=normalize(source).toLocaleLowerCase('ja-JP');
  const q=normalize(quote).toLocaleLowerCase('ja-JP');
  return Boolean(s&&q&&s.includes(q));
}

function isWeakGeneric(candidate={}){
  const axis=normalize(candidate.axis);
  return ['生産情報','電力仕様','数値仕様'].includes(axis);
}

function isConcreteActionable(candidate={}){
  const axis=normalize(candidate.axis);
  return ['お手入れ','収納形態','設置・構造','端子','電源方式','サイズ','容量'].includes(axis);
}

function riskPenalty(candidate={},source=''){
  const quote=normalize(candidate.quote);
  if(!quote||!sourceHasExact(source,quote)) return 100;
  const s=normalize(source);
  const at=s.toLocaleLowerCase('ja-JP').indexOf(quote.toLocaleLowerCase('ja-JP'));
  if(at<0) return 100;
  const before=s.slice(Math.max(0,at-6),at);
  const after=s.slice(at+quote.length,at+quote.length+12);
  if(/(?:非|不|未)\s*$/.test(before)) return 100;
  if(/^\s*(?:ではない|ではありません|非対応|対象外|別売|なし|無し|不要|を除く)/.test(after)) return 100;
  return 0;
}

function scoreCandidate(candidate={},context={}){
  const source=normalize(context.source||'');
  const identity=normalize(context.identity||'');
  if(!candidate||!candidate.quote||!sourceHasExact(source,candidate.quote)) return -Infinity;
  let score=Number(candidate.score)||0;
  score-=riskPenalty(candidate,source);
  if(!Number.isFinite(score)||score<0) return -Infinity;

  if(candidate.kind==='signal') score+=4;
  if(isConcreteActionable(candidate)) score+=3;
  if(isWeakGeneric(candidate)) score-=3;
  if(identity&&normalize(candidate.body).includes(identity)) score+=2;
  if(normalize(candidate.hook).length>=8) score+=1;
  if(normalize(candidate.quote).length>=4) score+=1;
  return score;
}

function selectBestCandidate(candidates=[],context={}){
  const evaluated=(Array.isArray(candidates)?candidates:[])
    .map((candidate,index)=>({candidate,index,score:scoreCandidate(candidate,context)}))
    .filter(x=>Number.isFinite(x.score))
    .sort((a,b)=>b.score-a.score||a.index-b.index);
  if(!evaluated.length) return null;

  const best=evaluated[0];
  const second=evaluated[1]||null;
  const margin=second?best.score-second.score:best.score;
  const confidence=best.score>=14&&margin>=2?'high':best.score>=10?'medium':'low';
  return {
    ...best.candidate,
    decision:{
      score:best.score,
      runnerUpScore:second?.score??null,
      margin:second?margin:null,
      confidence,
      evaluatedCount:evaluated.length,
      principles:['source_exact','accuracy_first','prefer_concrete_purchase_axis','avoid_weak_generic_angle']
    }
  };
}

function shouldPublish(candidate){
  if(!candidate?.decision) return false;
  if(candidate.decision.confidence==='low') return false;
  if(isWeakGeneric(candidate)&&candidate.decision.confidence!=='high') return false;
  return true;
}

module.exports={normalize,sourceHasExact,isWeakGeneric,isConcreteActionable,riskPenalty,scoreCandidate,selectBestCandidate,shouldPublish};
