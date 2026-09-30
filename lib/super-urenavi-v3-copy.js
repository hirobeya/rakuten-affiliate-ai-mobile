'use strict';

const {assessGeneratedCopy}=require('./super-urenavi-v3-quality');
const {compact,evidenceSentence,rankGroundedAttributes}=require('./super-urenavi-v3-expression');

function sentence(v=''){
  const s=compact(v);
  return s&&!/[。！？!?]$/.test(s)?s+'。':s;
}
function priceLine(price){
  const n=Number(price);
  return Number.isFinite(n)&&n>0?`価格：${Math.round(n).toLocaleString('ja-JP')}円`:'';
}
function acceptedAppeals(rows=[]){
  return [...rows].filter(x=>x?.verification?.supported===true).sort((a,b)=>(b.strength||0)-(a.strength||0)||(a.index||0)-(b.index||0));
}
function effectiveAppeals(validation={},verifiedAppeals=[]){
  if(validation?.valid!==true)return [];
  return acceptedAppeals(verifiedAppeals);
}
function chooseTier(validation,verifiedAppeals){
  if(!validation?.valid)return'invalid';
  if(effectiveAppeals(validation,verifiedAppeals).length)return'A';
  return'needs_value';
}
function valueBody(appeal,attributes=[],leadText=''){
  const parts=[];
  const value=sentence(appeal?.text),ease=sentence(appeal?.noHassle),scene=sentence(appeal?.scene),lead=compact(leadText);
  if(value)parts.push(value);
  if(ease&&compact(ease)!==compact(value))parts.push(ease);
  if(scene&&compact(scene)!==lead&&compact(scene)!==compact(value)&&compact(scene)!==compact(ease))parts.push(scene);
  const evidence=evidenceSentence(appeal,attributes);if(evidence)parts.push(evidence);
  return parts.join('\n');
}
function leadForAppeal(validation={},appeal={}){
  const scene=compact(appeal?.scene);if(scene)return{type:'scene',text:scene};
  const ease=compact(appeal?.noHassle);if(ease)return{type:'friction',text:ease};
  const specific=compact(validation?.productType?.specific);
  const ranked=rankGroundedAttributes(validation,[appeal]);
  const top=ranked.find(x=>(appeal?.attributeRefs||[]).includes(x.index))||ranked[0];
  const name=compact(top?.attribute?.name||top?.attribute?.value);
  if(specific&&name)return{type:'grounded_axis',text:`「${specific}」を選ぶなら、「${name}」に注目したい。`};
  if(specific)return{type:'identity',text:`「${specific}」を選ぶ理由を、仕様から確認したい。`};
  return null;
}
function composeVariants({item={},analysis={},maxVariants=3}={}){
  const validation=analysis.validation||analysis,verifiedAppeals=analysis.verifiedAppeals||[],usableAppeals=effectiveAppeals(validation,verifiedAppeals),tier=chooseTier(validation,verifiedAppeals);
  if(tier!=='A')return{tier,variants:[],quality:{copyReady:false,reasons:[tier==='invalid'?'invalid_product_identity':'no_verified_customer_value']}};
  const attributes=validation?.attributes||[],price=priceLine(item.itemPrice);
  const footer=['【ひとことメモ（実際に使用した場合のみ）】','',price,'※アフィリエイト広告を利用しています'].join('\n');
  const limit=Math.max(1,Math.min(3,Number(maxVariants)||3));
  const variants=[];
  for(const appeal of usableAppeals){
    if(variants.length>=limit)break;
    const lead=leadForAppeal(validation,appeal);if(!lead)continue;
    const text=[compact(lead.text),'',valueBody(appeal,attributes,lead.text),'',footer].join('\n');
    if(variants.some(v=>compact(v.text)===compact(text)))continue;
    variants.push({index:variants.length+1,hookType:lead.type||'scene',hook:compact(lead.text),appealIndex:appeal.index,text});
  }
  if(!variants.length)return{tier:'needs_value',variants:[],quality:{copyReady:false,reasons:['no_product_specific_hook']}};
  const usedIndexes=new Set(variants.map(v=>v.appealIndex));
  const usedAppeals=usableAppeals.filter(a=>usedIndexes.has(a.index));
  const quality=assessGeneratedCopy({validation,verifiedAppeals:usedAppeals,variants});
  if(!quality.copyReady)return{tier:'needs_value',variants:[],quality};
  return{tier:'A',variants,quality};
}
module.exports={priceLine,acceptedAppeals,effectiveAppeals,chooseTier,leadForAppeal,composeVariants};
