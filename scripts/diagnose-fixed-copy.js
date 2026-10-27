'use strict';
// Offline diagnostic: never generate, approve, alter stored drafts, or change thresholds.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const Module=require('node:module');
const root=path.resolve(__dirname,'..');
const dir=path.join(root,'docs/evaluations/20261027-fixed');
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
const bytes=fs.readFileSync(path.join(dir,'inputs.json'));
if(sha(bytes)!==fs.readFileSync(path.join(dir,'inputs.sha256'),'utf8').split(' ')[0])throw new Error('Frozen input modified');
const frozen=JSON.parse(bytes),data=name=>{const e=frozen.entries.find(e=>e.name===name);if(!e)throw new Error('Missing '+name);return e.data;};
global.fetch=async()=>{throw new Error('Network disabled in fixed diagnostic');};
const current=require('../lib/room-semantic-contract');
const provider=require('../lib/room-semantic-provider').createProvider({apiKey:'not-used'});
const {localZeroCall}=require('../api/room-ai-v3');
const source=execFileSync('git',['show',frozen.baselineCommit+':lib/room-semantic-contract.js'],{cwd:root,encoding:'utf8'});
const baselineModule=new Module(path.join(root,'lib/offline-baseline-contract.js'),module);
baselineModule.filename=path.join(root,'lib/offline-baseline-contract.js');
baselineModule.paths=Module._nodeModulePaths(path.join(root,'lib'));
baselineModule._compile(source,baselineModule.filename);
const baseline=baselineModule.exports;
const knownSources=[...data('archived-20261022/live-search-sources.json'),...data('archived-20261022/session-sources.json')].map(r=>({itemCode:r.item_code,itemName:r.item_name,itemCaption:r.item_caption,catchcopy:r.catchcopy||'',itemPrice:r.item_price}));
const sourceFor=r=>{
 const matches=knownSources.filter(x=>current.normalize(x.itemName)===current.normalize(r.item_name)&&current.normalize(x.itemCaption)===current.normalize(r.item_caption_normalized));
 const unique=[...new Map(matches.map(x=>[x.catchcopy,x])).values()];
 return {item:{itemCode:r.item_code,itemName:r.item_name,itemCaption:r.item_caption_normalized,catchcopy:unique.length===1?unique[0].catchcopy:''},sourceStatus:unique.length===1?'name/caption match archived source; catchcopy reconstructed, original request not retained':'name/caption retained; original catchcopy not established'};
};
const historicalLabels=data('archived-20261022/live-human-review.json');
const historicalSources=data('archived-20261022/live-local-analysis.json').items;
const products=[
 ...data('tests/fixtures/room-products.json').map(x=>({...x,cohort:'existing-development'})),
 ...data('tests/fixtures/room-unseen-products.json').map(x=>({...x,cohort:'previously-unseen-now-diagnostic'})),
 ...historicalSources.map(x=>({id:'washnet-'+x.rank,category:'洗濯ネット',cohort:'frozen-washnet10',item:x.item,historicalLocal:x.server,historicalRating:historicalLabels[x.item.itemCode]?.local||null}))
];
const localRows=products.map(row=>{
 const item=structuredClone(row.item),before=sha(JSON.stringify(item));const result=localZeroCall(item);
 if(before!==sha(JSON.stringify(item)))throw new Error('Local engine mutated source');
 return {id:row.id,category:row.category,cohort:row.cohort,itemCode:item.itemCode,sourceHash:sha(JSON.stringify(item)),ready:result?.ok===true&&result?.quality?.status==='ready',text:result?.quality?.text||'',initialEstimate:provider.requiredTokens('generate',item,{}),historicalLocal:row.historicalLocal||null,historicalRating:row.historicalRating};
});
const records=[];
for(const entry of frozen.entries){
 let rows=[];
 if(entry.name==='archived-20261022/saved-real-groq-sample.json'||entry.name==='archived-20261022/live-current-groq.json')rows=entry.data;
 else if(entry.name.startsWith('docs/measurements/'))rows=entry.data.records||[];
 for(const r of rows){const state=r.state||r.raw_ai_json?.state;if(state)records.push({origin:entry.name,row:r,state});}
}
const dedup=new Map();
for(const r of records){const key=[r.row.item_code,r.state.startedAt||'',r.row.schema_version||r.row.prompt_version||''].join('|');const old=dedup.get(key);if(!old||JSON.stringify(r.state).length>JSON.stringify(old.state).length)dedup.set(key,r);}
const drafts=new Map(),jobs=[];
for(const {origin,row,state} of dedup.values()){
 const resolved=sourceFor(row);const item=resolved.item;
 jobs.push({origin,itemCode:row.item_code,status:state.quality?.status||state.stage,calls:state.calls||[],tokensKnown:(state.calls||[]).every(c=>Number.isFinite(c.usage?.total_tokens)),totalTokens:(state.calls||[]).reduce((s,c)=>s+(c.usage?.total_tokens||0),0)});
 for(const h of [...(state.history||[]),{draft:state.draft,review:state.review,attempt:state.attempt}]){
  if(!h.draft)continue;
  const fixedSource=[item.itemName,item.itemCaption,item.catchcopy];
  const key=sha(JSON.stringify([fixedSource,h.draft,h.review||null]));if(drafts.has(key))continue;
  const before=sha(JSON.stringify(h));
  const old=baseline.inspect(item,h.draft),now=current.inspect(item,h.draft);
  const oldPublication=baseline.publication(item,h.draft,h.review),newPublication=current.publication(item,h.draft,h.review);
  if(before!==sha(JSON.stringify(h)))throw new Error('Replay mutated draft or review');
  const currentReview=h.review?current.assessReview(item,h.draft,h.review):null;
  drafts.set(key,{id:key,origin,itemCode:row.item_code,sourceStatus:resolved.sourceStatus,sourceHash:sha(JSON.stringify(fixedSource)),draft:structuredClone(h.draft),review:structuredClone(h.review||null),attempt:h.attempt,baselineMachine:old.failures,currentMachine:now.failures,baselinePublished:oldPublication.status,currentPublished:newPublication.status,savedReviewFailures:currentReview?.failures||null,reviewPresent:!!h.review,reviewQuality:h.review?.quality||null,nextReviewEstimate:provider.requiredTokens('verify',item,{draft:h.draft}),rewriteEstimate:provider.requiredTokens('generate',item,{...state,attempt:1,previousDraft:h.draft,failures:now.failures})});
 }
}
const rows=[...drafts.values()],histogram=arr=>arr.reduce((m,x)=>(m[x]=(m[x]||0)+1,m),{});
const summary={sourceProducts:localRows.length,localByCohort:Object.fromEntries([...new Set(localRows.map(x=>x.cohort))].map(c=>[c,{total:localRows.filter(x=>x.cohort===c).length,ready:localRows.filter(x=>x.cohort===c&&x.ready).length}])),savedJobs:jobs.length,sourceProductsWithSavedDrafts:new Set(rows.map(x=>x.sourceHash)).size,uniqueDraftReviewPairs:rows.length,machinePassBefore:rows.filter(x=>!x.baselineMachine.length).length,machinePassAfter:rows.filter(x=>!x.currentMachine.length).length,withSavedReview:rows.filter(x=>x.reviewPresent).length,withoutSavedReview:rows.filter(x=>!x.reviewPresent).length,publicationBefore:histogram(rows.map(x=>x.baselinePublished)),publicationAfter:histogram(rows.map(x=>x.currentPublished)),machineFailures:histogram(rows.flatMap(x=>x.currentMachine.map(f=>f.rule))),reviewFailures:histogram(rows.flatMap(x=>(x.savedReviewFailures||[]).map(f=>f.rule))),reviewRequestAbove8000:rows.filter(x=>x.nextReviewEstimate>8000).length,rewriteRequestAbove8000:rows.filter(x=>x.rewriteEstimate>8000).length,providerCallsThisEvaluation:0,independentTwoRaterSixPass:null};
const output={protocol:frozen.protocol,inputSha256:sha(bytes),baselineCommit:frozen.baselineCommit,currentRemoteCommit:frozen.currentRemoteCommit,baselineContractSha256:sha(source),currentContractSha256:sha(fs.readFileSync(path.join(root,'lib/room-semantic-contract.js'))),policy:require('../lib/room-semantic-engine').VERSION,limitations:frozen.restrictions,summary,localRows,draftRows:rows,jobs};
// Preserve the frozen pre-change reference used by comparative regressions.
const outputArg=process.argv.find(x=>x.startsWith('--output='));
const outputName=outputArg?outputArg.slice('--output='.length):'latest-results.json';
if(!/^[A-Za-z0-9_-]+\.json$/.test(outputName)||['results.json','inputs.json','editorial-findings.json'].includes(outputName))throw new Error('Output must not overwrite frozen evidence');
fs.writeFileSync(path.join(dir,outputName),JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
