'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module!=='undefined'&&module.exports) module.exports=api;
  if(root) root.UrenaviBenefitGrounding=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  const EXPANSION_TERMS=[
    '安心','快適','手間','減ら','片付','楽になる','便利','時短','しやす',
    '使いやす','持ち運びやす','蒸れにく','守る','防ぐ','備え','助け',
    '取りかかり','整え','確保','負担','ストレス','ラク'
  ];
  const SCAFFOLD=[
    'を条件に比較したい方に','を条件に比較したい人に',
    'を重視して比較したい方に','を重視して比較したい人に',
    'の表記があります','表記があります','この仕様を比較できます',
    '仕様を比較できます'
  ];
  function norm(v){return String(v||'').normalize('NFKC').replace(/\s+/g,' ').trim();}
  function compact(v){return norm(v).replace(/[\s　「」『』【】\[\]（）()、。,.・:：;；!！?？"'\-_/／]/g,'').toLowerCase();}
  function evidenceExists(evidence,sources){
    const ev=compact(evidence);
    return Boolean(ev&&(sources||[]).some(s=>compact(s).includes(ev)));
  }
  function unsupportedExpansion(text,evidence){
    const t=norm(text),ev=norm(evidence);
    return EXPANSION_TERMS.filter(term=>t.includes(term)&&!ev.includes(term));
  }
  function residualUnsupported(text,evidence){
    let r=compact(text);
    const ev=compact(evidence);
    if(ev) r=r.split(ev).join('');
    for(const phrase of SCAFFOLD){
      const p=compact(phrase);
      if(p) r=r.split(p).join('');
    }
    return r;
  }
  function validateBenefitCandidate({text='',evidence='',sources=[]}={}){
    const t=norm(text),ev=norm(evidence);
    const reasons=[];
    if(!t) reasons.push('empty_text');
    if(!ev) reasons.push('empty_evidence');
    if(ev&&!evidenceExists(ev,sources)) reasons.push('evidence_not_found');
    const expansion=unsupportedExpansion(t,ev);
    if(expansion.length) reasons.push('semantic_expansion:'+expansion.join('|'));
    const residual=ev?residualUnsupported(t,ev):compact(t);
    if(residual) reasons.push('unsupported_phrase:'+residual);
    return {valid:reasons.length===0,text:t,evidence:ev,reasons,semanticExpansion:expansion,residual};
  }
  function makeGroundedSelectionLine({label='',evidence='',sources=[]}={}){
    const x=norm(label);
    const text=x?x+'を条件に比較したい方に。':'';
    return validateBenefitCandidate({text,evidence,sources});
  }
  return {validateBenefitCandidate,makeGroundedSelectionLine,evidenceExists,unsupportedExpansion,residualUnsupported,EXPANSION_TERMS};
});
