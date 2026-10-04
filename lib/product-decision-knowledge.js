'use strict';

const data=require('../data/product-decision-knowledge-v1.json');

const VERSION=String(data.version||'');
const MAX_ITEMS=8;

function clean(value=''){
  return String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
}

function normalizeType(value=''){
  return clean(value).toLocaleLowerCase('ja-JP');
}

function cleanList(values,max=MAX_ITEMS){
  const out=[],seen=new Set();
  for(const raw of Array.isArray(values)?values:[]){
    const value=clean(raw);
    if(!value||value.length>100) continue;
    const key=value.toLocaleLowerCase('ja-JP');
    if(seen.has(key)) continue;
    seen.add(key);out.push(value);
    if(out.length>=max) break;
  }
  return out;
}

function validateEntry(raw){
  const productType=clean(raw?.productType);
  const status=raw?.status==='active'?'active':'needs_specific_type';
  const actsOn=clean(raw?.actsOn);
  const situations=cleanList(raw?.situations,5);
  const decisionAxes=cleanList(raw?.decisionAxes,8);
  const blockedInferences=cleanList(raw?.blockedInferences,8);
  if(!productType) return {valid:false,reason:'missing_product_type'};
  if(status==='active'&&(!actsOn||!situations.length||!decisionAxes.length||!blockedInferences.length)){
    return {valid:false,reason:'incomplete_active_knowledge'};
  }
  return {valid:true,knowledge:{productType,status,actsOn,situations,decisionAxes,blockedInferences,version:VERSION,usage:'reasoning_context_only'}};
}

const index=new Map();
for(const raw of Array.isArray(data.types)?data.types:[]){
  const checked=validateEntry(raw);
  if(!checked.valid) continue;
  index.set(normalizeType(checked.knowledge.productType),checked.knowledge);
}

function getDecisionKnowledge(productType=''){
  const knowledge=index.get(normalizeType(productType));
  if(!knowledge||knowledge.status!=='active') return null;
  return structuredClone(knowledge);
}

function getCandidateKnowledge(productType=''){
  const knowledge=index.get(normalizeType(productType));
  return knowledge?structuredClone(knowledge):null;
}

function inferDecisionProductType(itemName=''){
  const title=normalizeType(itemName);
  if(!title) return '';
  const hits=[];
  for(const knowledge of index.values()){
    if(knowledge.status!=='active') continue;
    const type=normalizeType(knowledge.productType);
    const at=title.indexOf(type);
    if(at<0) continue;
    hits.push({productType:knowledge.productType,at,length:[...type].length});
  }
  if(!hits.length) return '';
  hits.sort((a,b)=>a.at-b.at||b.length-a.length);
  const best=hits[0];
  const samePosition=hits.filter(x=>x.at===best.at);
  if(samePosition.length>1) return samePosition.sort((a,b)=>b.length-a.length)[0].productType;
  return best.productType;
}

function buildReasoningContext(productType=''){
  const k=getDecisionKnowledge(productType);
  if(!k) return null;
  return {
    productType:k.productType,
    actsOn:k.actsOn,
    situations:k.situations,
    decisionAxes:k.decisionAxes,
    blockedInferences:k.blockedInferences,
    instruction:'Use this only to choose what to inspect and which grounded source fact matters. Never treat this knowledge as evidence for a product claim. Every factual statement still requires the current item source.'
  };
}

module.exports={VERSION,validateEntry,getDecisionKnowledge,getCandidateKnowledge,inferDecisionProductType,buildReasoningContext};
