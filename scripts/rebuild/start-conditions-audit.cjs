'use strict';
const fs=require('node:fs'),path=require('node:path'),C=require('../../lib/urenavi-core/contracts'),B=require('../../lib/urenavi-core/capacity-analysis'),W=require('../../lib/urenavi-core/chat-wire');
const root=path.resolve(__dirname,'../..'),out=path.join(root,'docs/rebuild-20261028/p3-start-conditions');
const frozen=JSON.parse(fs.readFileSync(path.join(root,'docs/evaluations/20261027-fixed/inputs.json'))),data=n=>frozen.entries.find(e=>e.name===n).data;
const prior=JSON.parse(fs.readFileSync(path.join(root,'docs/rebuild-20261028/p3-final-gate/capacity-analysis.json')));
const rows=data('archived-20261022/live-local-analysis.json').items;
const wires=[];
const capacity=rows.map(r=>{
 const item=C.source(r.item),wire=W.compileRequest(C.request('draft',item));wires.push({itemCode:item.itemCode,stage:'draft',wire});
 const estimate=C.estimate(wire.body),p=prior.complete.find(v=>v.itemCode===item.itemCode);
 if(!p||p.sourceHash!==C.hash(item))throw Error('source_changed');
 return {itemCode:item.itemCode,sourceHash:C.hash(item),inputTokens:null,diagnosticHeuristicInput:estimate.input,outputReservation:3000,assumedTPM:8000,diagnosticSingleRequest:estimate.total,diagnosticExcess:Math.max(0,estimate.total-8000),singleRequestCertified:false,scenarioPathBudget:{twoCalls:16000,maxFourCalls:32000,enforcedInputPerStage:5000,type:'conditional rejection budget, not predicted usage or completion guarantee'},future:B.futureBounds(item),cause:estimate.total>8000?'source + fixed instructions/schema + uncalibrated estimate + output reservation exceed assumed TPM':'heuristic fits only; provider count/account limits not certified',uncertainty:'no compatible tokenizer/ranks; provider schema/template and rate reservation not reproduced',measurementRequired:['prompt_tokens','completion_tokens and reasoning_tokens','finish_reason','stage actual input including candidate','live rate headers and remaining daily organization/project budget']};
});
// Preserve saved source records as independent provenance; never patch the 34 incomplete fixtures.
const pool=new Map();
for(const name of ['archived-20261022/live-search-sources.json','archived-20261022/session-sources.json'])for(const r of data(name)){
 const source={itemCode:r.item_code,itemName:r.item_name,itemCaption:r.item_caption,catchcopy:r.catchcopy};C.source(source);
 if(!pool.has(source.itemCode))pool.set(source.itemCode,{source,sourceHash:C.hash(source),origin:name,originalRecord:r,conditions:{},conditionsScope:'frozen for future paired run; historical request conditions unproven'});
}
const diagnosis=JSON.parse(fs.readFileSync(path.join(root,'docs/evaluations/20261027-fixed/results.json')));
const historical=diagnosis.draftRows.map(r=>({id:r.id,itemCode:r.itemCode,origin:r.origin,sourceStatus:r.sourceStatus,draft:r.draft,eligibleForStrictPair:false,reason:'original catchcopy and complete original request conditions not retained'}));
const comparison={requested:20,distinctCompleteSavedProducts:pool.size,futurePairedCandidates:[...pool.values()],strictHistoricalPairs:0,missingFutureProducts:Math.max(0,20-pool.size),historicalOutputsPreserved:historical,oldRegenerations:0,newGenerations:0,plan:{maxCallsFor17:pool.size*4,ordinaryTwoStageCalls:pool.size*2,globalCeiling:80,scenarioTokensMax:pool.size*32000,scenarioTokensOrdinary:pool.size*16000,publicDailyBudget:200000,otherUseReserved:null,approvedCalls:0,stopConditions:['any unknown account or input token bound','any stage input > certified 5000 budget','organization/project minute/day insufficient','429','timeout/unknown send/usage','storage failure or lock/journal mismatch','max 4 per product or 80 global','incomplete JSON/finish_reason != stop: no publication','any caller outside the shared isolated journal: stop'],note:'17 are a frozen prospective input pool, NOT 17 completed old/new pairs. No old calls authorized; strict comparison cannot yet run.'}};
const mocks=prior.savedMockCandidates;
for(const m of mocks){const saved=JSON.parse(fs.readFileSync(path.join(root,m.path)));for(const stage of ['review','rewrite','rereview'])wires.push({origin:m.path,scope:'deterministic mock only, no product forecast',stage,wire:W.compileRequest(C.request(stage,saved.source,{draft:saved.draft,failures:saved.failures||[],conditions:saved.conditions||{}}))});}
const reasoning=[];for(const job of diagnosis.jobs)for(const call of job.calls||[])if(call.usage?.completion_tokens_details?.reasoning_tokens!==undefined)reasoning.push({origin:job.origin,itemCode:job.itemCode,stage:call.stage,completion:call.usage.completion_tokens,reasoning:call.usage.completion_tokens_details.reasoning_tokens});
for(const [name,v] of Object.entries({'capacity.json':capacity,'wire-payloads.json':wires,'comparison.json':comparison,'historical-reasoning.json':reasoning,'isolation.json':{environmentKeys:Object.keys(process.env),modules:Object.keys(require.cache).map(p=>path.relative(root,p)),inferenceCalls:0,dbCalls:0,guardRequired:true}}))fs.writeFileSync(path.join(out,name),JSON.stringify(v,null,2)+'\n');
console.log(JSON.stringify({capacityProducts:capacity.length,completePool:pool.size,strictPairs:0,preservedHistoricalDrafts:historical.length,reasoningRecords:reasoning.length,wirePayloads:wires.length}));
