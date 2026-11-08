'use strict';
const test=require('node:test'),fs=require('node:fs'),path=require('node:path');
const {candidateClaims}=require('../../lib/urenavi-core/value-graph');
const {resolveIdentityHint}=require('../../api/room-ai-v3');
const {generate}=require('../../lib/urenavi-core/last-resort');
const input=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../docs/evaluations/20261027-fixed/inputs.json'),'utf8'));
test('diagnostic: candidate coverage and reasons for frozen products (non-gating)',()=>{
 const out=[];
 for(const e of input.entries.filter(e=>/room-products|room-unseen|live-local-analysis/.test(e.name))){
  for(const v of Array.isArray(e.data)?e.data:e.data.items){
   const item=v.item,g=generate(item),id=resolveIdentityHint(item),a=candidateClaims({...item,identity:id});
   out.push({id:item.itemCode,stage:g.diagnostic?.stage||'ready',identity:id||null,sourceLength:item.itemCaption?.length||0,candidates:a.length,quote:a[0]?.quote?.slice(0,80)||null});
  }
 }
 console.log('VALUE_DIAGNOSTIC_BEGIN '+JSON.stringify(out));
 console.log('VALUE_DIAGNOSTIC_COUNTS '+JSON.stringify({total:out.length,identity:out.filter(x=>x.identity).length,withCandidates:out.filter(x=>x.candidates).length,improvable:out.filter(x=>x.stage!=='ready'&&x.candidates).length}));
});
