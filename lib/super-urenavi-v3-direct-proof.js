'use strict';

const safety=require('../public/structured-room-copy');
const DIRECT_PROOF_VERSION='exact-contiguous-source-v1';

function compact(value=''){
  return String(value??'').normalize('NFKC').replace(/\s+/g,' ').trim();
}

function stripTerminal(value=''){
  return compact(value).replace(/[。！？!?]+$/,'').trim();
}

function sourceContains(item,value){
  const v=compact(value);
  if(!v) return false;
  return [item?.itemName,item?.itemCaption].map(compact).some(source=>source.includes(v));
}

function sentences(value=''){
  return (compact(value).match(/[^。！？!?]+[。！？!?]?/g)||[]).map(stripTerminal).filter(Boolean);
}

// This is deliberately much stricter than semantic review. A draft can skip pass2
// only when every published sentence is already a contiguous source statement
// inside one of the exact evidence quotes. Paraphrases, inferred scenes and glued
// outcomes are never approved here; they still require the independent verifier.
function appealHasExactProof(appeal,validation,item){
  if(!appeal||!validation?.semanticDraft) return false;
  if(appeal.noHassle) return false;
  const refs=Array.isArray(appeal.attributeRefs)?appeal.attributeRefs:[];
  if(!refs.length) return false;
  const quotes=refs.map(i=>compact(validation.attributes?.[i]?.quote)).filter(Boolean);
  if(quotes.length!==refs.length||quotes.some(q=>!sourceContains(item,q))) return false;

  const published=[...sentences(appeal.scene),...sentences(appeal.text)];
  if(!appeal.scene||!appeal.text||!published.length) return false;
  if(published.some(sentence=>safety.RISK.test(sentence))) return false;
  return published.every(sentence=>quotes.some(q=>stripTerminal(q).includes(sentence)));
}

function canSkipPass2WithExactProof(validation,item){
  if(validation?.valid!==true||validation?.semanticDraft!==true) return false;
  const appeals=Array.isArray(validation.appeals)?validation.appeals:[];
  return appeals.length>0&&appeals.every(appeal=>appealHasExactProof(appeal,validation,item));
}

function applyExactProof(validation,item){
  const appeals=Array.isArray(validation?.appeals)?validation.appeals:[];
  if(!canSkipPass2WithExactProof(validation,item)) return null;
  return appeals.map(appeal=>({
    ...appeal,
    verification:{
      required:false,
      supported:true,
      keepDirectFact:true,
      reason:DIRECT_PROOF_VERSION
    }
  }));
}

module.exports={DIRECT_PROOF_VERSION,stripTerminal,sentences,appealHasExactProof,canSkipPass2WithExactProof,applyExactProof};
