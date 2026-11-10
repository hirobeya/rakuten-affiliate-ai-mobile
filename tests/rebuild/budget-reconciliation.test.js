'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),R=require('../../lib/urenavi-core/budget-reconciliation');
const {withSharedBudget}=require('../../lib/room-provider-budget');
function fixture(){
 const model='openai/gpt-oss-120b',at=Date.parse('2026-11-10T12:24:03Z');
 const row={revision:'saved',uncertain:{model,at,reason:'usage_unknown'},lease:null,models:{[model]:{tokenLimit:8000,remainingTokens:2071,tokenResetAt:at+45000}},notBefore:at+65000};
 const record={cache_key:'synthetic-cache',model,raw_ai_json:{state:{stage:'done',finishedAt:at-1000,quality:{status:'blocked'},calls:[{stage:'verify',attempt:1,error:'invalid_structured_output',usage:null,elapsedMs:8165}],upstreamErrors:[{stage:'verify',attempt:1,error:{status:400,code:'json_validate_failed'}}]}}};
 const evidence={source:'authenticated_groq_console',organization:'Personal',project:'Default Project',model,httpStatus:400,error:'json_validate_failed',requestedAt:'2026-11-10T12:23:56Z',matchingEntries:1,reservedTotal:7474,usage:{inputTokens:2975,outputTokens:2790,totalTokens:5765}};
 return {row,record,evidence,at};
}
test('accounting appends proof without deleting uncertainty or refunding limits',()=>{
 const f=fixture(),before=JSON.stringify(f),next=R.prepare(f.row,f.record,f.evidence,f.at+1);
 assert.equal(JSON.stringify(f),before);assert.deepEqual(next.uncertain,f.row.uncertain);assert.deepEqual(next.models,f.row.models);assert.equal(next.notBefore,f.row.notBefore);assert.equal(next.reconciliations[0].usage.totalTokens,5765);assert.equal(R.resolved(next),true);
 assert.throws(()=>R.prepare(next,f.record,f.evidence,f.at+2),/mismatch/);
 const reordered=JSON.parse(JSON.stringify(next,(k,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.entries(v).sort(([a],[b])=>b.localeCompare(a))):v));assert.equal(R.resolved(reordered),true,'JSONB key order does not change receipt identity');
 const later=structuredClone(next);later.uncertain.at++;assert.equal(R.resolved(later),false);
 const corrupt=structuredClone(next);corrupt.reconciliations[0].usage.inputTokens=0;assert.equal(R.resolved(corrupt),false);
});
for(const [name,mutate]of [
 ['wrong model',f=>{f.evidence.model='other';}],['wrong time',f=>{f.evidence.requestedAt='2026-11-10T12:20:00Z';}],['ambiguous record',f=>{f.evidence.matchingEntries=2;}],['unknown input',f=>{f.evidence.usage.inputTokens=null;}],['invented total',f=>{f.evidence.usage.totalTokens=0;}],['over reservation',f=>{f.evidence.reservedTotal=5000;}],['wrong failure',f=>{f.record.raw_ai_json.state.calls[0].error='network';}],['live lease',f=>{f.row.lease={sent:true};}],['missing cache identity',f=>{delete f.record.cache_key;}],['multiple unknown calls',f=>{f.record.raw_ai_json.state.calls.push({...f.record.raw_ai_json.state.calls[0]});}],['unfinished state',f=>{f.record.raw_ai_json.state.stage='verify';}]
])test('reconciliation rejects '+name,()=>{const f=fixture();mutate(f);assert.throws(()=>R.prepare(f.row,f.record,f.evidence,f.at+1),/mismatch/);});
test('original unknown stays blocked; exact reconciliation keeps time/cap gates and later uncertainty stops',async()=>{
 const f=fixture();let row=f.row;
 const store={load:async()=>structuredClone(row),swap:async(revision,next)=>{if(row.revision!==revision)return false;row=structuredClone(next);return true;}};
 let time=f.at+100000;
 const p=withSharedBudget({model:f.evidence.model,requiredTokens:()=>5995},{store,now:()=>time});
 await assert.rejects(p.acquire('generate',{},{}),e=>e.status===503);
 row=R.prepare(row,f.record,f.evidence,time);time=f.at+100;
 assert((await p.acquire('generate',{},{})).waitMs>0);
 time=f.at+100000;const permit=await p.acquire('generate',{},{});assert.equal(permit.waitMs,0);
 await permit.markSent();await permit.release({called:true,progressSaved:true,error:new Error('unknown')});
 assert.equal(row.reconciliations.length,1);assert.equal(R.resolved(row),false);
 await assert.rejects(p.acquire('generate',{},{}),e=>e.status===503);
});
