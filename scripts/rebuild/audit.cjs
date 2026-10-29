'use strict';
// Offline only. The only writes are experimental files beneath docs/rebuild-20261028/p3a.
const fs=require('node:fs'),path=require('node:path');
const C=require('../../lib/urenavi-core/contracts'),E=require('../../lib/urenavi-core/local-engine');
const {fixture}=require('../../tests/rebuild/fixture.cjs');
const out=path.resolve(__dirname,'../../docs/rebuild-20261028/p3a');fs.mkdirSync(out,{recursive:true});
const frozenBytes=fs.readFileSync(path.resolve(__dirname,'../../docs/evaluations/20261027-fixed/inputs.json'));
const frozen=JSON.parse(frozenBytes);const data=name=>frozen.entries.find(e=>e.name===name).data;
const products=[...data('tests/fixtures/room-products.json'),...data('tests/fixtures/room-unseen-products.json'),...data('archived-20261022/live-local-analysis.json').items];
// Baseline evidence is read only; no baseline provider module is loaded.
const rows=products.map((r,i)=>{
 const raw=r.item,missing=['itemCode','itemName','itemCaption','catchcopy'].filter(k=>typeof raw[k]!=='string');
 const item=Object.fromEntries(['itemCode','itemName','itemCaption','catchcopy'].map(k=>[k,String(raw[k]??'')]));
 const req=C.request('draft',item),estimate=C.estimate(req),max=E.capacityPlan(item);
 return {index:i,itemCode:item.itemCode,sourceHash:C.hash(item),missingOriginalFields:missing,estimateScope:missing.length?'LOWER_BOUND: absent original fields are NOT established empty; no execution input':'all four source fields retained; baseline request provenance still unpaired',sourceFieldsAvailable:missing.length===0,comparisonEligible:false,comparisonBlocker:'Exact original baseline request including catchcopy and generation conditions not yet paired with eligible baseline output',initial:estimate,schemaEnvelope:max,totalFourStageEnvelope:max.reduce((a,x)=>a+x.total,0),public8000Gate:max.every(x=>x.total<=8000),sourceCharacters:Object.values(item).reduce((a,s)=>a+s.length,0)};
});
const cases=require('../../data/fixed-review-cases-20261027.json').cases;
const diagnostics=cases.map((r,i)=>({id:r.id,sourceHash:C.hash(C.source(r.item)),sourceStatus:r.sourceStatus,oldSentences:r.draft.sentences.map(s=>s.text),existingMechanical:require('../../lib/room-semantic-contract').inspect(r.item,r.draft).failures,newRawOldDraftRejection:C.inspect(r.item,r.draft),requiredDiagnosticLoci:['sellingProduct/owners:販売本体と所有者','features.scope:対象/部位/条件/否定/程度','relations:特徴→意図の意味関係','bindings.clauses:本文の全事実節','quality.choice:固有の選択理由'],knownConcern:[
 '必要な色をすぐ取り出すという結果と、糸が整然と並ぶという特徴の含意を全文審査する必要あり',
 '胸の上布/ケープの所有者と適用範囲、着替え不要/すぐ対応の程度を分離して審査する必要あり',
 '機能の説明だけで具体的な選択意図との関係が本文にあるかをquality.choiceで審査する必要あり',
 'サイズ組合せ自由から旅行先の衣類整理の便利さへの意味関係が支えられているかをrelationsで審査する必要あり',
 '原文の洗濯方法とシワ/型崩れの作用・対象・条件が本文の全節で一致するか審査する必要あり'][i],limitation:'Human-authored diagnostic concern, not a new model verdict. Missing plan rejects legacy data but does not prove semantic improvement.'}));
(async()=>{
 const f=fixture(),weak=structuredClone(f.review);weak.quality.choice.verdict='fail';let n=0;
 const experiment=path.join(out,'mock-run-'+E.ENGINE_VERSION);
 const result=await E.run({item:f.item,directory:experiment,limits:{tokens:10000000,requests:4,perCallTokens:1000000},transport:async(req,meta)=>{
  n++;return {raw:meta.stage==='draft'||meta.stage==='rewrite'?f.draft:meta.stage==='review'?weak:f.review,usage:{prompt_tokens:100,completion_tokens:100,total_tokens:200},finish_reason:'stop'};
 }});
 const trace=result.calls.map(c=>({stage:c.stage,...c.estimate,usage:'SYNTHETIC 100/100; NEVER MEASURED'}));
 const summary={date:'2026-10-28',version:E.ENGINE_VERSION,model:C.MODEL,outputLimit:C.MAX_OUTPUT,networkCalls:0,groqCalls:0,dbCalls:0,mockCallsThisInvocation:n,mockTraceCalls:result.calls.length,sourceProducts:rows.length,sourceComplete:rows.filter(r=>r.sourceFieldsAvailable).length,sourceIncompleteLowerBounds:rows.filter(r=>!r.sourceFieldsAvailable).length,hashFrozenInputs:require('node:crypto').createHash('sha256').update(frozenBytes).digest('hex'),method:'Input heuristic ASCII/4 + nonASCII*1.4 + 500; full serialized request includes schema; output 3000 is reservation, not expected consumption. Envelope is schema character maxima, often impossible under 3000 output tokens; deliberately conservative, not predicted consumption.',completeSourceInitial:rows.filter(r=>r.sourceFieldsAvailable).map(r=>({itemCode:r.itemCode,...r.initial})),initial:{note:'34 rows lack original catchcopy; these aggregate values include lower bounds, never full-input admission evidence',min:Math.min(...rows.map(r=>r.initial.total)),max:Math.max(...rows.map(r=>r.initial.total)),mean:rows.reduce((a,r)=>a+r.initial.total,0)/rows.length,public8000Fit:rows.filter(r=>r.initial.total<=8000).length},fourStageEnvelope:{min:Math.min(...rows.map(r=>r.totalFourStageEnvelope)),max:Math.max(...rows.map(r=>r.totalFourStageEnvelope)),public8000Fit:rows.filter(r=>r.public8000Gate).length},mockTrace:trace,mockTwoStageReservation:trace[0].total+trace[1].total,mockFourStageReservation:trace.reduce((a,r)=>a+r.total,0),baselineReadyMean:9774.82,targetIncludingFailures:200000/90,measuredReduction:null,actualGeneratedQuality:null,p3b:'HOLD: conservative preflight cannot admit these payload envelopes under the assumed public 8000 per-minute budget; current account limits, shared remaining budget, tokenizer calibration and live output fit remain unverified. No request for execution approval yet.'};
 fs.writeFileSync(path.join(out,'capacity.json'),JSON.stringify({summary,products:rows},null,2)+'\n');
 fs.writeFileSync(path.join(out,'saved-failure-diagnostics.json'),JSON.stringify(diagnostics,null,2)+'\n');
 fs.writeFileSync(path.join(out,'mock-trace.json'),JSON.stringify({warning:'ONLY deterministic mocks; all usage synthetic; NOT Groq quality or token measurements',trace,status:result.status,output:result.output},null,2)+'\n');
 console.log(JSON.stringify(summary,null,2));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
