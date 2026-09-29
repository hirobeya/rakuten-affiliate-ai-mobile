'use strict';

const {assessGeneratedCopy}=require('./super-urenavi-v3-quality');
const {compact,referencedAttributes,evidenceSentence,productSpecificLeads}=require('./super-urenavi-v3-expression');

function sentence(v=''){
  const s=compact(v);
  return s&&!/[。！？!?]$/.test(s)?s+'。':s;
}

function priceLine(price){
  const n=Number(price);
  return Number.isFinite(n)&&n>0?`価格：${Math.round(n).toLocaleString('ja-JP')}円`:'';
}

function acceptedAppeals(rows=[]){
  return [...rows]
    .filter(x=>x?.verification?.supported===true)
    .sort((a,b)=>(b.strength||0)-(a.strength||0)||(a.index||0)-(b.index||0));
}

function deterministicGroundedAppeals(validation={}){
  if(validation?.valid!==true)return [];
  const attributes=Array.isArray(validation.attributes)?validation.attributes:[];
  const axes=Array.isArray(validation.decisionAxes)?validation.decisionAxes:[];
  const out=[];
  axes.forEach((axis,index)=>{
    const refs=[...new Set((axis?.attributeRefs||[]).filter(i=>Number.isInteger(i)&&attributes[i]?.quote))];
    const axisText=compact(axis?.text);
    if(!axisText||!refs.length)return;
    const names=refs.map(i=>compact(attributes[i]?.name||attributes[i]?.value)).filter(Boolean).slice(0,3);
    if(!names.length)return;
    out.push({
      index:1000+index,
      text:`${axisText}なら、${names.map(x=>`「${x}」`).join('と')}が比較ポイントになります`,
      noHassle:'',
      scene:axisText,
      attributeRefs:refs,
      strength:2,
      needsVerification:false,
      verification:{required:false,supported:true,keepDirectFact:true,reason:'deterministic_grounded_decision_axis'}
    });
  });
  return out;
}

function effectiveAppeals(validation={},verifiedAppeals=[]){
  const accepted=acceptedAppeals(verifiedAppeals);
  return accepted.length?accepted:deterministicGroundedAppeals(validation);
}

function chooseTier(validation,verifiedAppeals){
  if(!validation?.valid) return 'invalid';
  if(effectiveAppeals(validation,verifiedAppeals).length) return 'A';
  return 'needs_value';
}

function valueBody(appeal,attributes=[],hookText=''){
  const parts=[];
  const value=sentence(appeal?.text);
  const ease=sentence(appeal?.noHassle);
  const scene=sentence(appeal?.scene);
  const hook=compact(hookText);
  if(value) parts.push(value);
  if(ease&&compact(ease)!==compact(value)) parts.push(ease);
  if(scene&&compact(scene)!==hook&&compact(scene)!==compact(value)&&compact(scene)!==compact(ease)) parts.push(scene);
  const evidence=evidenceSentence(appeal,attributes);
  if(evidence) parts.push(evidence);
  return parts.join('\n');
}

function composeVariants({item={},analysis={},maxVariants=3}={}){
  const validation=analysis.validation||analysis;
  const verifiedAppeals=analysis.verifiedAppeals||[];
  const usableAppeals=effectiveAppeals(validation,verifiedAppeals);
  const tier=chooseTier(validation,verifiedAppeals);
  if(tier!=='A'){
    return {
      tier,
      variants:[],
      quality:{copyReady:false,reasons:[tier==='invalid'?'invalid_product_identity':'no_verified_customer_value']}
    };
  }

  const best=usableAppeals[0];
  const hooks=productSpecificLeads(validation,best,Math.max(1,Math.min(3,Number(maxVariants)||3)));
  if(!hooks.length){
    return {tier:'needs_value',variants:[],quality:{copyReady:false,reasons:['no_product_specific_hook']}};
  }

  const attributes=validation?.attributes||[];
  const price=priceLine(item.itemPrice);
  const footer=['【ひとことメモ（実際に使用した場合のみ）】','',price,'※アフィリエイト広告を利用しています'].join('\n');
  const variants=hooks.map((hook,index)=>({
    index:index+1,
    hookType:hook.type||'scene',
    hook:compact(hook.text),
    text:[compact(hook.text),'',valueBody(best,attributes,hook.text),'',footer].join('\n')
  }));

  const quality=assessGeneratedCopy({validation,verifiedAppeals:usableAppeals,variants});
  if(!quality.copyReady) return {tier:'needs_value',variants:[],quality};
  return {tier:'A',variants,quality};
}

module.exports={priceLine,acceptedAppeals,deterministicGroundedAppeals,effectiveAppeals,chooseTier,composeVariants};
