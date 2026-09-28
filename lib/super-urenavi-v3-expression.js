'use strict';

function compact(value=''){
  // Customer-facing copy must preserve the source's visible symbols exactly (for example ℃).
  return String(value??'').replace(/\s+/g,' ').trim();
}

function normalizedComparison(value=''){
  return String(value??'')
    .normalize('NFKC')
    .replace(/[「」『』。！？!?、,\s]/g,'')
    .trim();
}

function referencedAttributes(appeal,attributes=[]){
  return (appeal?.attributeRefs||[])
    .filter(Number.isInteger)
    .map(i=>attributes[i])
    .filter(Boolean);
}

function isDirectRestatement(appeal,attributes=[]){
  const normalized=normalizedComparison(appeal?.text);
  if(!normalized) return true;
  const refs=referencedAttributes(appeal,attributes);
  if(!refs.length) return true;
  return refs.some(a=>{
    const quote=normalizedComparison(a?.quote);
    const value=normalizedComparison(a?.value);
    return Boolean((quote&&quote.includes(normalized)) || (value&&normalized===value));
  });
}

function structuralAppealStrength(appeal,attributes=[]){
  if(!appeal || Number(appeal.strength)<2) return false;
  if(!referencedAttributes(appeal,attributes).length) return false;
  const text=compact(appeal.text);
  if(!text) return false;
  if(isDirectRestatement(appeal,attributes) && !compact(appeal.noHassle) && !compact(appeal.scene)) return false;
  return true;
}

function rankGroundedAttributes(validation={},verifiedAppeals=[]){
  const attributes=Array.isArray(validation.attributes)?validation.attributes:[];
  const rows=attributes.map((attribute,index)=>({attribute,index,score:0}));
  for(const appeal of verifiedAppeals||[]){
    if(appeal?.verification?.supported!==true) continue;
    const weight=(Number(appeal.strength)||1)*10;
    for(const ref of appeal.attributeRefs||[]) if(rows[ref]) rows[ref].score+=weight;
  }
  for(const axis of validation.decisionAxes||[]){
    for(const ref of axis?.attributeRefs||[]) if(rows[ref]) rows[ref].score+=5;
  }
  for(const row of rows){
    if(row.attribute?.valueType==='identifier') row.score-=5;
    if(row.attribute?.valueType==='range'||row.attribute?.valueType==='options') row.score+=2;
  }
  return rows.sort((a,b)=>b.score-a.score||a.index-b.index);
}

function evidenceSentence(appeal,attributes=[]){
  const refs=referencedAttributes(appeal,attributes).slice(0,3);
  const seen=new Set();
  const quotes=[];
  for(const a of refs){
    const q=compact(a?.quote);
    if(q&&!seen.has(q)){seen.add(q);quotes.push(`「${q}」`);}
  }
  return quotes.length?`その根拠は、商品情報の${quotes.join('、')}です。`:'';
}

function productSpecificLeads(validation={},appeal={},limit=3){
  const out=[];
  const seen=new Set();
  const push=(type,text)=>{const t=compact(text);if(t&&!seen.has(t)){seen.add(t);out.push({type,text:t});}};

  for(const hook of validation.hooks||[]) push(hook?.type||'scene',hook?.text);
  if(compact(appeal.scene)) push('scene',appeal.scene);
  if(compact(appeal.noHassle)) push('friction',`「${compact(appeal.noHassle)}」を重視するなら、ここは確認したいポイント。`);

  const specific=compact(validation?.productType?.specific);
  const ranked=rankGroundedAttributes(validation,[appeal]);
  const top=ranked[0];
  const axis=(validation.decisionAxes||[]).find(a=>Array.isArray(a?.attributeRefs)&&a.attributeRefs.includes(top?.index));
  if(specific&&compact(axis?.text)) push('decision_axis',`「${specific}」を選ぶなら、「${compact(axis.text)}」は見逃したくない。`);
  if(specific) push('identity',`「${specific}」を探している人が、候補に入れる理由を一つずつ確認したい。`);

  return out.slice(0,Math.max(1,Math.min(3,Number(limit)||3)));
}

module.exports={
  compact,normalizedComparison,referencedAttributes,isDirectRestatement,structuralAppealStrength,
  rankGroundedAttributes,evidenceSentence,productSpecificLeads
};
