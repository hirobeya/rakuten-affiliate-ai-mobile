'use strict';

const FALLBACK_HOOKS=[
  {type:'failure_avoidance',text:'買ってから「思っていたのと違う」は避けたいところ。'},
  {type:'scene',text:'毎日使うものほど、選ぶ基準ははっきりさせたい。'},
  {type:'question',text:'どれを選ぶか迷ったら、まず使う場面から考えてみませんか？'}
];

function compact(value=''){
  // Copy output keeps the source's visible symbols (for example ℃) intact.
  return String(value??'').replace(/\s+/g,' ').trim();
}

function priceLine(price){
  const n=Number(price);
  return Number.isFinite(n)&&n>0?`価格：${Math.round(n).toLocaleString('ja-JP')}円`:'';
}

function uniqueHooks(validation,limit=3){
  const seen=new Set();
  const rows=[];
  for(const hook of [...(validation?.hooks||[]),...FALLBACK_HOOKS]){
    const text=compact(hook?.text);
    if(!text || seen.has(text)) continue;
    seen.add(text);
    rows.push({type:compact(hook?.type)||'scene',text});
    if(rows.length>=limit) break;
  }
  return rows;
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
  return quotes.join('、')+'と確認できます。';
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

function directFactLines(attributes,limit=2){
  return (attributes||[]).slice(0,limit).map(a=>{
    const q=compact(a?.quote);
    return q?`「${q}」と確認できます。`:'';
  }).filter(Boolean);
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
    return [evidenceSentence(refs),appealSentence(appeal)].filter(Boolean).join('\n');
  }
  if(tier==='B'){
    return directFactLines(attributes,2).join('\n');
  }
  if(tier==='C'){
    return specific?`${specific}の商品情報を確認しながら、自分の条件に合うか見ていけます。`:'';
  }
  return '';
}

function composeVariants({item={},analysis={},maxVariants=3}={}){
  const validation=analysis.validation||analysis;
  const verifiedAppeals=analysis.verifiedAppeals||[];
  const tier=chooseTier(validation,verifiedAppeals);
  if(tier==='invalid') return {tier,variants:[]};
  const hooks=uniqueHooks(validation,Math.max(2,Math.min(3,Number(maxVariants)||3)));
  const body=buildBody({tier,validation,verifiedAppeals,item});
  const price=priceLine(item.itemPrice);
  const footer=['【ひとことメモ（実際に使用した場合のみ）】','',price,'※アフィリエイト広告を利用しています'].filter((x,i,a)=>x!=='' || (i===1&&a[0])).join('\n');
  const variants=hooks.map((hook,index)=>({
    index:index+1,
    hookType:hook.type,
    hook:hook.text,
    text:[hook.text,'',body,'',footer].filter((x,i,a)=>{
      if(x!=='') return true;
      return i>0&&i<a.length-1&&a[i-1]!==''&&a[i+1]!=='';
    }).join('\n')
  }));
  return {tier,variants};
}

module.exports={
  FALLBACK_HOOKS,priceLine,uniqueHooks,acceptedAppeals,chooseTier,composeVariants
};
