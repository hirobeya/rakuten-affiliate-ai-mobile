'use strict';

const test=require('node:test');
const fixtures=require('../public/room-holdout8-evaluation-fixtures.json');
const {localZeroCall,resolveLiteralIdentity,extractLiteralSpecs}=require('../api/room-ai-v3');
const {resolveLocalUnderstanding}=require('../lib/super-urenavi-router');
const {repeatedLiteralIdentity}=require('../lib/repeated-literal-identity');
const structured=require('../public/structured-room-copy');

test('diagnose untouched holdout8 zero-call successes before tuning',()=>{
  const rows=[];
  for(const f of fixtures){
    const result=localZeroCall(f.item);
    if(!result) continue;
    const rule=resolveLocalUnderstanding({itemName:f.item.itemName,itemCaption:f.item.itemCaption});
    const literal=resolveLiteralIdentity(f.item);
    const repeated=(!rule&&!literal)?repeatedLiteralIdentity(f.item):null;
    const chosen=rule||literal||repeated;
    const identity=String(chosen?.canonicalIdentity||chosen?.raw?.productType?.value||'').trim();
    const copy=structured.compose({...f.item,itemCaption:''},{identity});
    rows.push({
      id:f.id,
      category:f.category,
      finalType:result.productType?.specific||null,
      ruleType:rule?.raw?.productType?.value||null,
      literalType:literal?.canonicalIdentity||literal?.raw?.productType?.value||null,
      repeatedType:repeated?.raw?.productType?.value||null,
      structuredIdentity:copy?.understanding?.identity||null,
      structuredMethod:copy?.understanding?.method||null,
      structuredFacts:(copy?.facts||[]).map(x=>x.quote),
      literalSpecs:extractLiteralSpecs(f.item).map(x=>x.quote),
      text:result.quality?.text||null
    });
  }
  console.log('HOLDOUT8_ZERO_SUCCESS_DIAGNOSTICS '+JSON.stringify(rows));
});
