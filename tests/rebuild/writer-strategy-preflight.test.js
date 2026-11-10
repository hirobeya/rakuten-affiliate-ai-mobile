'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const P=require('../../lib/room-semantic-provider');
const frozen=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../docs/evaluations/20261027-fixed/inputs.json'),'utf8'));
const modes=['standard','editorial','guided'];
test('comparison preflight: same source/schema/model/output budget, estimated extra input size',()=>{
 const provider=modes.map(writerMode=>P.createProvider({apiKey:'no_network_calls',writerMode}));
 const tally=modes.map(()=>({totalEstimate:0,minEstimate:Infinity,maxEstimate:0}));
 let count=0;
 for(const entry of frozen.entries.filter(e=>/room-products|room-unseen|live-local-analysis/.test(e.name)))for(const x of Array.isArray(entry.data)?entry.data:entry.data.items){
  const item=x.item,req=modes.map(mode=>P.stageRequest('generate',item,{},P.REVIEW_PROMPT,mode));
  for(let i=1;i<req.length;i++){
   assert.deepEqual(req[0].schema.properties.sentences.items.properties.text,req[i].schema.properties.sentences.items.properties.text);
   assert.deepEqual(req[0].schema.properties.sentences.items.properties.kinds,req[i].schema.properties.sentences.items.properties.kinds);
   assert.equal(req[0].maxOutputTokens,req[i].maxOutputTokens);
   assert.equal(req[i].schema.additionalProperties,false);
  }
  const amounts=provider.map(p=>p.requiredTokens('generate',item,{}));
  for(let i=0;i<3;i++){
   assert.ok(Number.isFinite(amounts[i])&&amounts[i]>0);
   tally[i].totalEstimate+=amounts[i];
   tally[i].minEstimate=Math.min(tally[i].minEstimate,amounts[i]);
   tally[i].maxEstimate=Math.max(tally[i].maxEstimate,amounts[i]);
  }
  count++;
 }
 assert.equal(count,44);
 const result={items:count,modelsActuallyCalled:0,qualityCompared:false,estimatesAreNotProviderUsage:true,byMode:Object.fromEntries(modes.map((m,i)=>[m,{meanReservedTokenEstimate:Math.round(tally[i].totalEstimate/count),min:tally[i].minEstimate,max:tally[i].maxEstimate}]))};
 console.log('WRITER_STRATEGY_PREFLIGHT '+JSON.stringify(result));
});
