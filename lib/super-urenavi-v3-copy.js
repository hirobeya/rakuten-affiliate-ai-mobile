'use strict';

const {
  attributePriority,axisForAttribute,factProof,generatedLeads
}=require('./super-urenavi-v3-expression');

function compact(value=''){
  return String(value??'').replace(/\s+/g,' ').trim();
}

function priceLine(price){
  const n=Number(price);
  return Number.isFinite(n)&&n>0?`価格：${Math.round(n).toLocaleString('ja-JP')}円`:'';
}

function acceptedAppeals(verifiedAppeals=[]){
  return [...verifiedAppeals]
    .filter(x=>x?.verification?.supported===true)
    .sort((a,b)=>(b.strength||0)-(a.strength||0) || (a.index||0)-(b.index||0));
}

function referencedAttributes(appeal,attributes){
  const out=[];
  for(const ref of appeal?.attributeRefs||[]){
    if(!Number.isInteger(ref) || !attributes?.[ref]) continue;
    out.push(attributes[ref]);
  }
  return out.slice(0,3);
}

function evidenceSentence(attributes){
  const quotes=[];
  const seen=new Set();
  for(const a of attributes||[]){
    const q=compact(a?.quote);
    if(q && !seen.has(q)){seen.add(q);quotes.push(`「${q}」`);}
  }
  if(!quotes.length) return '';
  return `根拠として、商品情報には${quotes.join('、')}とあります。`;
}

function appealSentence(appeal){
  if(!appeal) return '';
  const parts=[];
  const text=compact(appeal.text);
  const noHassle=compact(appeal.noHassle);
  if(text) parts.push(/[。！？!?]$/.test(text)?text:text+'。');
  if(noHassle && noHassle!==text) parts.push(/[。！？!?]$/.test(noHassle)?noHassle:noHassle+'。');
  return parts.join('');
}

function directDecisionLines(validation,verifiedAppeals,limit=2){
  const ranked=attributePriority(validation,verifiedAppeals);
  const lines=[];
  for(const row of ranked){
    const axis=axisForAttribute(validation,row.index);
    const axisText=compact(axis?.text);
    const proof=factProof(row.attribute);
    if(axisText&&proof) lines.push(`確認ポイントは「${axisText}」。${proof}`);
    else if(proof) lines.push(proof);
    if(lines.length>=limit) break;
  }
  return lines;
}

function chooseTier(validation,verifiedAppeals){
  if(!validation?.valid) return 'invalid';
  if(acceptedAppeals(verifiedAppeals).length && (validation?.attributes||[]).length) return 'A';
  if((validation?.attributes||[]).length) return 'B';
  return 'C';
}

function buildBody({tier,validation,verifiedAppeals,item}){
  const specific=compact(validation?.productType?.specific)||compact(item?.itemName);
  const attributes=validation?.attributes||[];
  if(tier==='A'){
    const appeal=acceptedAppeals(verifiedAppeals)[0];
    const refs=referencedAttributes(appeal,attributes);
    return [appealSentence(appeal),evidenceSentence(refs)].filter(Boolean).join('\n');
  }
  if(tier==='B'){
    return directDecisionLines(validation,verifiedAppeals,2).join('\n');
  }
  if(tier==='C'){
    return specific?`「${specific}」として確認できる商品です。商品情報が少ないため、性能や効果は決めつけず、価格と掲載内容を見比べて判断できます。`:'';
  }
  return '';
}

function composeVariants({item={},analysis={},maxVariants=3}={}){
  const validation=analysis.validation||analysis;
  const verifiedAppeals=analysis.verifiedAppeals||[];
  const tier=chooseTier(validation,verifiedAppeals);
  if(tier==='invalid') return {tier,variants:[]};
  const leads=generatedLeads(validation,verifiedAppeals,Math.max(2,Math.min(3,Number(maxVariants)||3)));
  const body=buildBody({tier,validation,verifiedAppeals,item});
  const price=priceLine(item.itemPrice);
  const footer=['【ひとことメモ（実際に使用した場合のみ）】','',price,'※アフィリエイト広告を利用しています'].filter((x,i,a)=>x!=='' || (i===1&&a[0])).join('\n');
  const variants=leads.map((lead,index)=>({
    index:index+1,
    hookType:lead.type,
    hook:lead.text,
    text:[lead.text,'',body,'',footer].filter((x,i,a)=>{
      if(x!=='') return true;
      return i>0&&i<a.length-1&&a[i-1]!==''&&a[i+1]!=='';
    }).join('\n')
  }));
  return {tier,variants};
}

module.exports={
  priceLine,acceptedAppeals,chooseTier,composeVariants
};
