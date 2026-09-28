'use strict';

function compact(value=''){
  return String(value??'').normalize('NFKC').replace(/\s+/g,' ').trim();
}

function attributePriority(validation={},verifiedAppeals=[]){
  const attributes=Array.isArray(validation.attributes)?validation.attributes:[];
  const scores=attributes.map((attribute,index)=>({attribute,index,score:0}));

  for(const axis of validation.decisionAxes||[]){
    const refs=Array.isArray(axis?.attributeRefs)?axis.attributeRefs:[];
    refs.forEach((ref,pos)=>{
      if(scores[ref]) scores[ref].score+=Math.max(1,6-pos);
    });
  }

  for(const appeal of verifiedAppeals||[]){
    if(appeal?.verification?.supported!==true) continue;
    const weight=(Number(appeal.strength)||1)*10;
    for(const ref of appeal.attributeRefs||[]){
      if(scores[ref]) scores[ref].score+=weight;
    }
  }

  for(const row of scores){
    if(row.attribute?.valueType==='identifier') row.score-=5;
    if(row.attribute?.valueType==='range' || row.attribute?.valueType==='options') row.score+=2;
  }

  return scores.sort((a,b)=>b.score-a.score || a.index-b.index);
}

function axisForAttribute(validation={},attributeIndex){
  const axes=Array.isArray(validation.decisionAxes)?validation.decisionAxes:[];
  return axes.find(axis=>Array.isArray(axis.attributeRefs)&&axis.attributeRefs.includes(attributeIndex))||null;
}

function factProof(attribute){
  const quote=compact(attribute?.quote);
  return quote?`商品情報では「${quote}」と明記されています。`:'';
}

function decisionReason(validation={},ranked=[]){
  const specific=compact(validation?.productType?.specific);
  const top=ranked[0];
  if(!top) return specific?`「${specific}」を選ぶなら、自分の使い方に合うかを確認したいところ。`:'';
  const axis=axisForAttribute(validation,top.index);
  const axisText=compact(axis?.text);
  if(specific&&axisText) return `「${specific}」を選ぶとき、まず確認したいのは「${axisText}」。`;
  if(axisText) return `選ぶとき、まず確認したいのは「${axisText}」。`;
  return specific?`「${specific}」を選ぶなら、仕様を一つずつ確かめたいところ。`:'';
}

function generatedLeads(validation={},verifiedAppeals=[],limit=3){
  const hooks=(validation.hooks||[]).map(h=>({type:compact(h?.type)||'scene',text:compact(h?.text)})).filter(h=>h.text);
  const ranked=attributePriority(validation,verifiedAppeals);
  const specific=compact(validation?.productType?.specific);
  const extra=[];
  const reason=decisionReason(validation,ranked);
  if(reason) extra.push({type:'decision_axis',text:reason});

  for(const row of ranked.slice(0,2)){
    const axis=axisForAttribute(validation,row.index);
    const axisText=compact(axis?.text);
    if(specific&&axisText) extra.push({type:'comparison',text:`「${specific}」で迷ったら、「${axisText}」を比べておきたい。`});
  }

  if(specific){
    extra.push({type:'identity',text:`「${specific}」を探しているなら、価格だけでなく自分の条件に合うかも見ておきたい。`});
    extra.push({type:'fit_check',text:`「${specific}」は、使う場面と掲載条件を照らし合わせて選びたい。`});
    extra.push({type:'choice',text:`「${specific}」を候補にするなら、決め手になる情報を先に確認しておきたい。`});
  }

  const out=[];
  const seen=new Set();
  for(const lead of [...hooks,...extra]){
    const text=compact(lead.text);
    if(!text||seen.has(text)) continue;
    seen.add(text);
    out.push({...lead,text});
    if(out.length>=Math.max(1,Math.min(3,Number(limit)||3))) break;
  }
  return out;
}

module.exports={attributePriority,axisForAttribute,factProof,decisionReason,generatedLeads};
