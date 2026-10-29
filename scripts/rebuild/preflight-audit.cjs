'use strict';
const fs=require('node:fs'),path=require('node:path');
const C=require('../../lib/urenavi-core/contracts'),E=require('../../lib/urenavi-core/local-engine'),A=require('../../lib/urenavi-core/admission');
const {fixture}=require('../../tests/rebuild/fixture.cjs');
const out=path.resolve(__dirname,'../../docs/rebuild-20261028/p3-preflight');
const frozenBytes=fs.readFileSync(path.resolve(__dirname,'../../docs/evaluations/20261027-fixed/inputs.json'));
const frozen=JSON.parse(frozenBytes);const data=n=>frozen.entries.find(e=>e.name===n).data;
const products=[...data('tests/fixtures/room-products.json'),...data('tests/fixtures/room-unseen-products.json'),...data('archived-20261022/live-local-analysis.json').items];
function parts(req){const user=JSON.parse(req.messages[1].content);return {fullSerializedBytes:Buffer.byteLength(JSON.stringify(req)),systemContentBytes:Buffer.byteLength(req.messages[0].content),userContentBytes:Buffer.byteLength(req.messages[1].content),schemaSerializedBytes:Buffer.byteLength(JSON.stringify(req.response_format)),sourceNestedBytes:Buffer.byteLength(JSON.stringify(user.source)),candidateNestedBytes:user.candidate?Buffer.byteLength(JSON.stringify(user.candidate)):0,feedbackNestedBytes:user.feedback?Buffer.byteLength(JSON.stringify(user.feedback)):0,note:'Nested component byte counts overlap userContentBytes; never add all columns. Full JSON serialization includes escaping and framing. Bytes are NOT tokens.'};}
const f=fixture(),scenarioInputs={draft:5000,review:5000,rewrite:5000,rereview:5000};
const rows=products.map((r,index)=>{
 const missing=['itemCode','itemName','itemCaption','catchcopy'].filter(k=>typeof r.item[k]!=='string');
 if(missing.length)return {index,itemCode:r.item.itemCode,missing,admitted:false,scope:'incomplete original; no source normalization or payload construction',stages:null,pathBudget:null,reason:'source_field_missing'};
 const item=C.source(r.item);
 const stages=['draft','review','rewrite','rereview'].map(stage=>{
  const future=stage!=='draft',request=C.request(stage,item,{draft:f.draft,failures:[{rule:'quality_choice',id:'r',detail:'synthetic failure'}]});
  const n=C.estimate(request);
  return {stage,scope:future?'synthetic candidate shape substituted; NOT this product generation or forecast':'saved full source, actual initial payload',inputEstimate:n.input,outputReservation:3000,heuristicTotal:n.total,scenarioInputBudget:5000,scenarioTotalBudget:8000,heuristicFitsScenario:n.total<=8000,actualInputTokens:null,actualUsage:null,parts:parts(request),actualFutureInputKnown:!future};
 });
 return {index,itemCode:item.itemCode,sourceHash:C.hash(item),missing,admitted:false,reason:'capacity_unverified; tokenizer/provider accounting/account remaining unknown',stages,pathBudget:{twoStage:16000,fourStage:32000,type:'enforced scenario budget, NOT future size upper bound or prediction',completionGuaranteed:false},oldSchemaEnvelope:E.capacityPlan(item),initialHeuristicFits8000:stages[0].heuristicFitsScenario};
});
const mockRequests=['draft','review','rewrite','rereview'].map(stage=>{const req=C.request(stage,f.item,{draft:f.draft,failures:[{rule:'quality_choice'}]});return {stage,heuristic:C.estimate(req),parts:parts(req)};});
const summary={date:'2026-10-28 JST',complete:rows.filter(r=>!r.missing.length).length,incomplete:rows.filter(r=>r.missing.length).length,initialHeuristicFits8000:rows.filter(r=>!r.missing.length&&r.initialHeuristicFits8000).length,liveAdmitted:0,gate:'HOLD / capacity not certified',scenarioInputs,scenarioReservationTwo:16000,scenarioReservationFour:32000,frozenSha256:require('node:crypto').createHash('sha256').update(frozenBytes).digest('hex'),realUsage:null,reduction:null,target2222Proven:false};
fs.writeFileSync(path.join(out,'capacity.json'),JSON.stringify({summary,products:rows,mockRequests},null,2)+'\n');
fs.writeFileSync(path.join(out,'isolation.json'),JSON.stringify({engineVersion:E.ENGINE_VERSION,loadedModules:Object.keys(require.cache).map(p=>path.relative(path.resolve(__dirname,'../..'),p)),environmentKeys:Object.keys(process.env).sort(),realGroqCalls:0,dbCalls:0,transport:'no transport invoked by capacity audit; tests deterministic mocks only',kernelFirewallVerified:false,tokenizers:{tiktoken:false,transformers:false,tokenizers:false},liveMode:'rejected by admission validator; engine also requires offline guard'},null,2)+'\n');
console.log(JSON.stringify(summary));
