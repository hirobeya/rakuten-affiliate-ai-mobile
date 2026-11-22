'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {resolveSourceUnderstanding}=require('../lib/super-urenavi-router');
const {verifiedMeasuredSourceCopy}=require('../public/purchase-copy-quality');
const item=require('./fixtures/paid-pilot-measurement.json');

test('public measurement preserves the actual specification and its footnotes',()=>{
 const {sourceCopy}=resolveSourceUnderstanding(item);
 assert.ok(verifiedMeasuredSourceCopy(item,sourceCopy));
 for(const term of ['約60秒','水温・室温23度','通電自動オフするまでの時間','約140mL']){
  assert.ok(sourceCopy.text.includes(term));
 }
 const edited=structuredClone(sourceCopy);
 const missing=edited.proof.measurement.notes.pop();
 edited.text=edited.text.replace(missing.quote,'');
 assert.equal(verifiedMeasuredSourceCopy(item,edited),false);
});

test('public measurement rejects missing or duplicate conditions and another model',()=>{
 for(const itemCaption of [
  item.itemCaption.replace('※2：約140mL。',''),
  item.itemCaption+' ※2：約160mL。',
  item.itemCaption.replace('機種名 PCM-N080','機種名 PCM-A081')
 ]){
  assert.equal(Boolean(resolveSourceUnderstanding({...item,itemCaption}).sourceCopy),false);
 }
});
