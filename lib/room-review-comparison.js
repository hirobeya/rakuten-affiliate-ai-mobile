'use strict';
// Owner-only Preview experiment: one existing reviewer call on an immutable
// recorded draft. No generation, no publication, no extra production AI stage.
const {createHash}=require('node:crypto');
const {authorize,db}=require('./billing');
const {createCacheStore}=require('./super-urenavi-cache');
const {createProvider,DEFAULT_MODEL,REVIEW_PROMPT}=require('./room-semantic-provider');
const {withSharedBudget,createBudgetStore,reconcileCompletedLease}=require('./room-provider-budget');
const {inspect,assessReview}=require('./room-semantic-contract');
const {measure,summarize,logger}=require('./room-copy-cost');
const fixtures=require('../data/fixed-review-cases-20261027.json');
const hash=x=>createHash('sha256').update(typeof x==='string'?x:JSON.stringify(x)).digest('hex');
const version='fixed_review_'+hash([fixtures,REVIEW_PROMPT,require('node:fs').readFileSync(require.resolve('./room-review-comparison'),'utf8')]).slice(0,16);
function createHandler(deps={}){
 const authFn=deps.authorize||authorize,store=deps.store||createCacheStore(db),now=deps.now||Date.now;
 const quota=deps.consumeQuota||(async()=>{const n=Number(process.env.GROQ_ROOM_DAILY_LIMIT||200);const r=await db('rpc/urenavi_consume_ai_daily_limit',{method:'POST',body:JSON.stringify({p_limit:Number.isSafeInteger(n)&&n>0?n:200})});return r===true||r?.allowed===true;});
 return async function(req,res){
  res.setHeader('Cache-Control','no-store');
  if(process.env.VERCEL_ENV!=='preview')return res.status(404).json({message:'Not found'});
  const usage=[];let admission,response,error,called=false,progressSaved=false;
  const responseEnvelope=status=>({json:body=>({status,body})});
  const outcome=await (async()=>{
  try{
   const auth=await authFn(req);
   if(!auth?.ok||auth.plan!=='owner')return responseEnvelope(403).json({message:'owner_preview_only'});
   const owner=String(auth.user?.email||auth.user?.id||'');if(!owner)return responseEnvelope(401).json({message:'account_identity_required'});
   if(req.method==='GET')return responseEnvelope(200).json({experiment:true,publishable:false,version,cases:fixtures.cases.map(c=>({id:c.id,label:c.label,item:c.item,draft:c.draft})),variants:['before','after']});
   if(req.method!=='POST')return responseEnvelope(405).json({message:'Method not allowed'});
   const body=req.body||{};
   if(body.reconcile===true){
    if(Object.keys(body).length!==1)return responseEnvelope(400).json({message:'invalid_reconciliation'});
    const apiKey=String(process.env.GROQ_API_KEY||'');
    if(!apiKey&&!deps.budgetStore)return responseEnvelope(503).json({message:'review_budget_unavailable'});
    const budget=deps.budgetStore||createBudgetStore(db,'preview|'+apiKey);
    const records=[];
    const priorVersion='fixed_review_b32d71da9178f3e0';
    for(const c of fixtures.cases)for(const variant of ['before','after']){
     const row=await store.loadProduct({itemCode:'__'+priorVersion+':'+variant+':'+c.id,itemName:c.item.itemName,itemCaption:c.item.itemCaption,catchcopy:c.item.catchcopy});
     const p=row?.raw_ai_json?.experiment;
     if(row?.schema_version===priorVersion&&p?.version===priorVersion&&p.experiment===true&&p.pending===false&&p.publishable===false&&p.caseId===c.id&&p.variant===variant&&p.sourceHash===hash(c.item)&&p.draftHash===hash(c.draft))records.push({recordedAt:Date.parse(row.updated_at),model:DEFAULT_MODEL,response:{usage:p.usage,rateLimit:p.rateLimits}});
    }
    const result=await reconcileCompletedLease({store:budget,records,now});
    return responseEnvelope(200).json({experiment:true,publishable:false,reconciled:true,...result,providerCalls:0});
   }
   const fixture=fixtures.cases.find(c=>c.id===body.caseId);
   if(!fixture||!['before','after'].includes(body.variant)||Object.keys(body).some(k=>!['caseId','variant','statusOnly'].includes(k)))return responseEnvelope(400).json({message:'invalid_fixed_review_case'});
   const prompt=body.variant==='before'?fixtures.baselinePrompt:REVIEW_PROMPT;
   const source=fixture.item,state={stage:'verify',attempt:0,calls:[],headers:{},draft:fixture.draft};
   const key={itemCode:'__'+version+':'+body.variant+':'+fixture.id,itemName:source.itemName,itemCaption:source.itemCaption,catchcopy:source.catchcopy};
   const read=async()=>{const row=await store.loadProduct(key);return row?.schema_version===version?row.raw_ai_json?.experiment:null;};
   const base={experiment:true,publishable:false,version,caseId:fixture.id,variant:body.variant,sourceHash:hash(source),draftHash:hash(fixture.draft),promptHash:hash(prompt)};
   const cached=await read();if(cached)return responseEnvelope(200).json({...cached,cached:true,resourceUsage:summarize([measure({model:DEFAULT_MODEL,calls:0,owner,stage:'fixed_review_cache'})])});
   if(body.statusOnly===true)return responseEnvelope(202).json({...base,pending:true,retryAfterMs:0,resourceUsage:summarize([measure({model:DEFAULT_MODEL,calls:0,owner,stage:'fixed_review_status'})])});
   const apiKey=String(process.env.GROQ_API_KEY||'');
   if(!apiKey&&!deps.providerFactory){const e=new Error('Unavailable');e.status=503;throw e;}
   const raw=deps.providerFactory?deps.providerFactory({reviewPrompt:prompt}):createProvider({apiKey,model:DEFAULT_MODEL,reviewPrompt:prompt});
   const budget=deps.budgetStore||createBudgetStore(db,'preview|'+apiKey);
   const provider=withSharedBudget(raw,{store:budget,now});
   admission=await provider.acquire('verify',source,state);
   if(admission.waitMs>0)return responseEnvelope(202).json({...base,pending:true,retryAfterMs:admission.waitMs,resourceUsage:summarize([measure({model:raw.model,calls:0,owner,stage:'fixed_review_wait'})])});
   const fresh=await read();if(fresh)return responseEnvelope(200).json({...fresh,cached:true,resourceUsage:summarize([measure({model:raw.model,calls:0,owner,stage:'fixed_review_cache'})])});
   if(!await quota('verify')){const e=new Error('Limit');e.status=429;throw e;}
   await admission.markSent();called=true;const start=now();
   response=await provider.call('verify',source,state);
   const row=measure({model:raw.model,usage:response.usage,owner,stage:'fixed_review',elapsedMs:now()-start});usage.push(row);(deps.logCost||logger)(row);
   const result={...base,pending:false,review:response.raw,machine:inspect(source,fixture.draft),assessment:assessReview(source,fixture.draft,response.raw),usage:response.usage||null,rateLimits:response.rateLimit||{}};
   await store.saveProduct({...key,model:raw.model,promptVersion:version,schemaVersion:version,rawAiJson:{experiment:result},resultStatus:'ok'});progressSaved=true;
   return responseEnvelope(200).json({...result,cached:false,resourceUsage:summarize(usage)});
  }catch(e){error=e;return responseEnvelope(e.status===429?429:e.status===503?503:502).json({experiment:true,publishable:false,pending:false,message:e.status===429?'review_experiment_limit':'review_experiment_unavailable',resourceUsage:usage.length?summarize(usage):null});}
  finally{if(admission?.release){try{await admission.release({response,error,called,progressSaved});}catch{return responseEnvelope(503).json({experiment:true,publishable:false,pending:false,message:'review_budget_release_unconfirmed'});}}}
  })();
  // Never send HTTP before the shared lease has been reconciled: serverless
  // execution may be frozen as soon as res.json ends the response.
  return res.status(outcome.status).json(outcome.body);
 };
}
module.exports=createHandler();module.exports.createHandler=createHandler;module.exports.version=version;
