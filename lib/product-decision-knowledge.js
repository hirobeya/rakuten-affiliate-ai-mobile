'use strict';

const data=require('../data/product-decision-knowledge-v1.json');
const derived=require('../data/product-decision-knowledge-derived-v1.json');

const VERSION=String(data.version||'');
const DERIVED_VERSION=String(derived.version||'');
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

function validateEntry(raw,sourceVersion=VERSION){
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
  return {valid:true,knowledge:{productType,status,actsOn,situations,decisionAxes,blockedInferences,version:String(sourceVersion||VERSION),usage:'reasoning_context_only'}};
}

const index=new Map();
for(const source of [{rows:data.types,version:VERSION},{rows:derived.types,version:DERIVED_VERSION}]){
  for(const raw of Array.isArray(source.rows)?source.rows:[]){
    const checked=validateEntry(raw,source.version);
    if(!checked.valid) continue;
    const key=normalizeType(checked.knowledge.productType);
    if(index.has(key)) continue;
    index.set(key,checked.knowledge);
  }
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
    instruction:'Use this only as reasoning guidance. First inspect the CURRENT item source and choose the single source-grounded feature that gives the strongest natural purchase angle for a likely use situation. You may create fresh, persuasive Japanese wording and a natural hypothetical scene, but you must not create any new fact, performance, outcome, guarantee, user experience, or compatibility beyond the current source. Do not merely list specs when one grounded feature can become a clear reason to choose. Never treat this knowledge as evidence for a product claim. Every factual statement still requires the current item source, and every blocked inference must be avoided.'
  };
}

module.exports={VERSION,DERIVED_VERSION,validateEntry,getDecisionKnowledge,getCandidateKnowledge,inferDecisionProductType,buildReasoningContext};
