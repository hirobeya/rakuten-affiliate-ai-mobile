'use strict';

const {isNonWholeProductIdentity}=require('./local-identity-role-guard');
const {hasCompetingCompoundIdentity}=require('./local-zero-identity-conflict');

function normalize(value=''){
  return String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
}

function rawIdentity(local){
  if(!local||local?.validation?.productType?.valid!==true) return '';
  return normalize(local?.canonicalIdentity||local?.raw?.productType?.value);
}

function conflictedTrustedLocal({title='',ruleLocal=null,literalLocal=null}={}){
  const t=normalize(title);
  return [ruleLocal,literalLocal].find(local=>{
    const identity=rawIdentity(local);
    return Boolean(identity&&hasCompetingCompoundIdentity(t,identity));
  })||null;
}

function hasTrustedIdentityConflict(args={}){
  return Boolean(conflictedTrustedLocal(args));
}

function unpack(local,source,title){
  if(!local||local?.validation?.productType?.valid!==true) return null;
  const sourceIdentity=normalize(local?.raw?.productType?.value);
  const identity=normalize(local?.canonicalIdentity||sourceIdentity);
  const quote=normalize(local?.raw?.productType?.evidence||sourceIdentity);
  if(!identity||!quote||!normalize(title).includes(quote)) return null;
  if(isNonWholeProductIdentity(identity,title)) return null;
  const matchIndex=Number.isInteger(local.matchIndex)?local.matchIndex:normalize(title).indexOf(quote);
  const hypothesis=local.identityHypothesis||{};
  return {local,source,identity,quote,matchIndex,hypothesis};
}

function evidenceStrength(row){
  const h=row.hypothesis||{};
  const method=String(h.method||'');
  if(method==='distributed_leading_support') return 4+Math.min(3,Number(h.supportCount)||0);
  if(method==='leading_compound_family'||method==='leading_stem_family') return 3+Math.min(3,Number(h.supportCount)||0);
  if(method==='repeated_title_support') return 3+Math.min(3,Number(h.supportCount)||0);
  if(method==='source_agreement') return 4;
  if(method==='evidence_backed_semantic_composition') return 3+Math.min(3,Number(h.supportKinds?.length)||0);
  return 2;
}

function sourceReliability(source){
  if(source==='rule') return 9;
  if(source==='literal') return 7;
  if(source==='repeated') return 5;
  return 0;
}

function score(row,title,all){
  let total=sourceReliability(row.source)+evidenceStrength(row);
  if(row.matchIndex===0) total+=3;
  else if(row.matchIndex>0&&row.matchIndex<=18) total+=1;
  if(row.identity.length>=5) total+=1;
  if(hasCompetingCompoundIdentity(title,row.identity)) total-=5;

  for(const other of all){
    if(other===row) continue;
    if(row.identity.includes(other.identity)&&row.identity!==other.identity) total+=2;
    if(other.identity.includes(row.identity)&&row.identity!==other.identity) total-=1;
  }
  return total;
}

function sameFamily(a,b){
  if(!a||!b) return false;
  return a.identity.includes(b.identity)||b.identity.includes(a.identity);
}

function isSemanticHypothesis(row){
  return row?.source==='repeated'&&row?.hypothesis?.method==='evidence_backed_semantic_composition';
}

function resultFrom(row,runner,unique){
  return {
    ...row.local,
    arbitration:{
      version:'2026-10-04-local-identity-arbitration-v3',
      winner:{identity:row.identity,source:row.source,score:row.score},
      runnerUp:runner?{identity:runner.identity,source:runner.source,score:runner.score}:null,
      candidates:unique.map(x=>({identity:x.identity,source:x.source,score:x.score,matchIndex:x.matchIndex,method:x.hypothesis?.method||null}))
    }
  };
}

function selectLocalIdentity({title='',ruleLocal=null,literalLocal=null,repeatedLocal=null}={}){
  const t=normalize(title);
  const rows=[
    unpack(ruleLocal,'rule',t),
    unpack(literalLocal,'literal',t),
    unpack(repeatedLocal,'repeated',t)
  ].filter(Boolean);
  if(!rows.length) return null;

  const unique=[];
  for(const row of rows){
    const found=unique.find(x=>x.identity===row.identity);
    if(!found) unique.push(row);
    else if(sourceReliability(row.source)>sourceReliability(found.source)) Object.assign(found,row);
  }
  for(const row of unique) row.score=score(row,t,unique);
  unique.sort((a,b)=>b.score-a.score||a.matchIndex-b.matchIndex||b.identity.length-a.identity.length);

  let best=unique[0],runner=unique[1];
  if(!best) return null;

  // A conflict-free deterministic rule is already a high-confidence product-role decision.
  // Later title hypotheses may explain an unknown, but must not silently overturn it.
  const trustedRule=unique.find(x=>x.source==='rule'&&!hasCompetingCompoundIdentity(t,x.identity));
  if(trustedRule&&best!==trustedRule){
    runner=best;
    best=trustedRule;
  }

  // Semantic composition is a last-resort hypothesis. If an earlier deterministic
  // identity is conflicted, preserve that conflict through localZeroCall so the item
  // stops instead of falling through to a later rescue path.
  if(isSemanticHypothesis(best)){
    const conflicted=conflictedTrustedLocal({title:t,ruleLocal,literalLocal});
    if(conflicted) return conflicted;
    const trusted=unique
      .filter(x=>x.source==='rule'||x.source==='literal')
      .sort((a,b)=>b.score-a.score)[0];
    if(trusted&&trusted.identity!==best.identity){
      if(hasCompetingCompoundIdentity(t,trusted.identity)) return trusted.local;
      runner=best;
      best=trusted;
    }
  }

  if(hasCompetingCompoundIdentity(t,best.identity)) return best.local;
  if(runner&&!sameFamily(best,runner)&&best.score-runner.score<2) return null;
  return resultFrom(best,runner,unique);
}

module.exports={normalize,rawIdentity,conflictedTrustedLocal,hasTrustedIdentityConflict,unpack,evidenceStrength,sourceReliability,score,sameFamily,isSemanticHypothesis,selectLocalIdentity};
