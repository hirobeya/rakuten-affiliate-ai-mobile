'use strict';
const {createHash}=require('node:crypto');
const {inspect,publication}=require('./room-semantic-contract');
const providerContract=require('./room-semantic-provider');
const VERSION='room_contract_'+createHash('sha256').update(JSON.stringify([providerContract.WRITER_SCHEMA,providerContract.REVIEW_SCHEMA,providerContract.WRITER_PROMPT,providerContract.REVIEW_PROMPT])+require('node:fs').readFileSync(require.resolve('./room-semantic-contract'),'utf8')).digest('hex').slice(0,16);
const inflight=new Map();
async function advance(args){const key=VERSION+'|'+args.item.itemCode+'|'+(args.runKey||'')+'|'+args.item.itemName+'|'+args.item.itemCaption;if(inflight.has(key))return inflight.get(key);const p=step(args);inflight.set(key,p);try{return await p;}finally{inflight.delete(key);}}
async function step({item,store,provider,consumeQuota=async()=>true,runKey='',now=Date.now}){
 const key={itemCode:'__semantic_preview__:'+VERSION+':'+item.itemCode+(runKey?':'+runKey:''),itemName:item.itemName,itemCaption:item.itemCaption};
 let row=await store.loadProduct(key);let state=row?.schema_version===VERSION&&row.model===provider.model?row.raw_ai_json?.state:null;
 state=state||{stage:'generate',attempt:0,startedAt:now(),calls:[],history:[],headers:{},nextAt:0};
 const save=()=>store.saveProduct({...key,model:provider.model,promptVersion:VERSION,schemaVersion:VERSION,rawAiJson:{state},resultStatus:state.stage==='done'&&state.quality?.status!=='ready'?'unknown':'ok'});
 const result=()=>({ok:state.quality?.status==='ready',pending:state.stage!=='done',retryAfterMs:Math.max(0,(state.nextAt||0)-now()),phase:state.stage==='generate'?(state.attempt?'regeneration':'generation'):(state.attempt?'reverification':'verification'),version:VERSION,model:provider.model,quality:state.quality||{status:'pending',text:'',reasons:[]},variants:state.quality?.status==='ready'?[{index:1,hookType:'scene',text:state.quality.text}]:[],productType:state.draft?.product?{specific:state.draft.product.what,general:state.draft.product.acts_on}:null,groq:{pass1Calls:state.calls.filter(c=>c.stage==='generate').length,pass2Calls:state.calls.filter(c=>c.stage==='verify').length,totalCalls:state.calls.length},elapsedMs:(state.finishedAt||now())-state.startedAt,diagnostics:{draft:state.draft,review:state.review,history:state.history,rateLimits:state.headers,calls:state.calls,machine:state.machine}});
 if(state.stage==='done'||state.nextAt>now())return result();
 if(await consumeQuota(state.stage)===false){const e=new Error('AI daily limit reached');e.status=429;throw e;}
 let response;const stage=state.stage,started=now();
 try{response=await provider.call(stage,item,state);}catch(e){
  if(e.status===429&&e.rateLimit&&(state.rateRetries||0)<1){const delay=Math.max(providerContract.rateWait(e.rateLimit,provider.requiredTokens(stage,item,state)),providerContract.duration(e.rateLimit['retry-after']));if(delay>0&&delay<=120000){state.rateRetries=(state.rateRetries||0)+1;state.headers=e.rateLimit;state.nextAt=now()+delay;await save();return result();}}
  e.stage=stage;throw e;
 }
 state.rateRetries=0;state.calls.push({stage,attempt:state.attempt,elapsedMs:now()-started,usage:response.usage||null,rateLimits:response.rateLimit||{}});state.headers=response.rateLimit||{};
 if(stage==='generate'){state.draft=response.raw;state.machine=inspect(item,state.draft);state.review=null;if(state.machine.ok)state.stage='verify';else fail(state.machine.failures);}
 else{state.review=response.raw;state.quality=publication(item,state.draft,state.review);if(state.quality.status==='ready'){state.stage='done';state.finishedAt=now();}else fail(state.quality.reasons);}
 if(state.stage!=='done')state.nextAt=now()+providerContract.rateWait(state.headers,provider.requiredTokens(state.stage,item,state));else state.nextAt=0;
 await save();return result();
 function fail(reasons){state.history.push({attempt:state.attempt,draft:state.draft,review:state.review,failures:reasons});if(state.attempt===0){state.previousDraft=state.draft;state.failures=reasons;state.attempt=1;state.stage='generate';state.quality=null;}else{state.quality={status:'blocked',text:'',reasons,ledger:[]};state.stage='done';state.finishedAt=now();}}
}
module.exports={advance,VERSION};
