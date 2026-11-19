'use strict';
const {authorize,authenticateSearchUser,db}=require('../lib/billing');
const {createCacheStore}=require('../lib/super-urenavi-cache');
const {advance}=require('../lib/room-semantic-engine');
const {createProvider,DEFAULT_MODEL}=require('../lib/room-semantic-provider');
const {localZeroCall,verifiedCaptionEditorialRescue,verifiedTitleSignalEditorialRescue}=require('../api/room-ai-v3');
const {verifiedLocalCopy}=require('../public/purchase-copy-quality');
const {guardUnsupportedBenefitCopy}=require('../public/fact-safety');
const {measure,logger,meteredProvider,summarize}=require('../lib/room-copy-cost');
const {createBudgetStore,withSharedBudget}=require('./room-provider-budget');
const models=new Set(['openai/gpt-oss-120b','openai/gpt-oss-20b']);
// Single publication contract for paid local-only generation. Production
// never gets to a provider unless a separately reviewed feature is enabled.
// This is intentionally stricter than the historical Preview fallback.
function provenLocalCopy(item,result){
 const text=String(result?.quality?.text||'');
 return verifiedLocalCopy(item,result,text)
   &&guardUnsupportedBenefitCopy(item,text)===text;
}
function localBlockedResponse(res,reason){
 return res.status(409).json({
  ok:false,pending:false,phase:'local',version:'super-urenavi-v3-conditional-preview',
  model:'local',quality:{status:'blocked',text:'',reasons:[reason]},
  variants:[],groq:{pass1Calls:0,pass2Calls:0,totalCalls:0},message:'source_verified_copy_unavailable'
 });
}
function createHandler(deps={}){
 const authFn=deps.authorize||authorize,store=deps.store||createCacheStore(db),log=deps.logCost||logger;
 const quota=deps.consumeQuota||(async(_stage,configuredLimit)=>{
  const n=Number(configuredLimit||process.env.GROQ_ROOM_DAILY_LIMIT||200);
  const result=await db('rpc/urenavi_consume_ai_daily_limit',{method:'POST',body:JSON.stringify({p_limit:Number.isSafeInteger(n)&&n>0?n:200})});
  return result===true||result?.allowed===true;
 });
 return async function handler(req,res){
  const measurements=[];const record=row=>{measurements.push(row);log(row);};
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({message:'Method not allowed'});
  const runtimeEnv=String(process.env.VERCEL_ENV||'');
  const isPreview=runtimeEnv==='preview',isProduction=runtimeEnv==='production';
  if(!isPreview&&!isProduction)return res.status(404).json({message:'Not found'});
  try{
   const auth=await authFn(req);
   if(!auth?.ok||(isPreview&&auth.plan!=='owner')
     ||(isProduction&&!['owner','base','pro'].includes(auth.plan)))
    return res.status(403).json({message:isPreview?'owner_preview_only':'active_subscription_required'});
   const body=req.body&&typeof req.body==='object'?req.body:{};
   if(typeof body.itemName!=='string'||!body.itemName.trim()||body.itemName.length>1000||typeof body.itemCaption!=='string'||body.itemCaption.length>12000)return res.status(400).json({message:'invalid_product_source'});
   if(body.catchcopy!==undefined&&(typeof body.catchcopy!=='string'||body.catchcopy.length>500))return res.status(400).json({message:'invalid_product_source'});
   // Explicit read-only integration. Never fall through to legacy generation.
   if(body.completedCoreOnly===true){
    if(typeof deps.loadCompletedCore!=='function')return res.status(503).json({ok:false,pending:false,message:'completed_core_store_unavailable'});
    const bridge=require('./urenavi-core/app-bridge').create({loadCompleted:deps.loadCompletedCore});
    try{
     const out=await bridge({environment:process.env.VERCEL_ENV,authorization:auth,item:{itemCode:body.itemCode,itemName:body.itemName,itemCaption:body.itemCaption,catchcopy:body.catchcopy}});
     return out?res.status(200).json(out):res.status(404).json({ok:false,pending:false,message:'completed_core_cache_miss'});
    }catch{return res.status(409).json({ok:false,pending:false,message:'completed_core_result_rejected'});}
   }
   if(isProduction&&(body.evaluationRun!==undefined||body.evaluationModel!==undefined||body.statusOnly===true))
    return localBlockedResponse(res,'production_test_or_status_mode_forbidden');
   const runKey=body.evaluationRun===undefined?'':String(body.evaluationRun);
   if(runKey&&!/^[A-Za-z0-9_-]{1,80}$/.test(runKey))return res.status(400).json({message:'invalid_evaluation_run'});
   if(body.evaluationModel!==undefined&&(!runKey||!models.has(body.evaluationModel)))return res.status(400).json({message:'invalid_evaluation_model'});
   const model=body.evaluationModel||String(process.env.GROQ_ROOM_MODEL||DEFAULT_MODEL).trim();
   const owner=String(auth.user?.email||auth.user?.id||'');
   if(!owner)return res.status(401).json({message:'account_identity_required'});
   const item={itemCode:String(body.itemCode||'').slice(0,300),itemName:body.itemName.trim(),itemCaption:body.itemCaption,catchcopy:body.catchcopy||'',itemPrice:Number(body.itemPrice)||0};
   // Production AI fallback is an explicit, default-off commercial policy.
   // Approval requires both the feature flag and an independently bounded
   // daily limit; no limit means zero provider calls in Production.
   const paidLimit=Number(process.env.URENAVI_PAID_SEMANTIC_DAILY_LIMIT);
   const paidSemanticAllowed=isProduction
     &&process.env.URENAVI_PAID_SEMANTIC_FALLBACK==='true'
     &&Number.isSafeInteger(paidLimit)&&paidLimit>=1&&paidLimit<=20;
   // Preserve the already tested, source-grounded zero-call engine. Its old
   // local contract remains explicit; never invent acts_on to re-label it.
   if(!runKey&&body.statusOnly!==true){
    const localFn=deps.localZeroCall||localZeroCall;
    if(isProduction){
      // No fallback to Groq, no quota claim, no cache write and no retry.
      // Publication is limited to the exact iPhone-verified source contract.
      const baseline=localFn(item);
      if(provenLocalCopy(item,baseline)){
        record(measure({model:'local',calls:0,owner,stage:'local'}));
        return res.status(200).json({...baseline,resourceUsage:summarize(measurements)});
      }
      const editorial=localFn(item,'',{}, {editorial:true,linkedReason:true,identityExpansion:true,verifiedIntent:true});
      if((verifiedCaptionEditorialRescue(item,editorial)||verifiedTitleSignalEditorialRescue(item,editorial))
         &&provenLocalCopy(item,editorial)){
        record(measure({model:'local',calls:0,owner,stage:'local'}));
        return res.status(200).json({...editorial,resourceUsage:summarize(measurements)});
      }
      if(!paidSemanticAllowed)return localBlockedResponse(res,'source_verified_purchase_reason_missing');
      // Opted-in Production may continue to the SAME evidence-first semantic
      // writer/reviewer, still governed by the shared global budget below.
    }
    const publish=local=>{
     record(measure({model:'local',calls:0,owner,stage:'local'}));
     return res.status(200).json({...local,resourceUsage:summarize(measurements)});
    };
    const baseline=localFn(item);
    const baselineUnbound=Boolean(baseline?.ok&&!provenLocalCopy(item,baseline));
    if(provenLocalCopy(item,baseline))return publish(baseline);
    // Real iPhone /api/room-copy path must reuse the verified editorial
    // engine, not only the isolated /api/room-ai-v3 test endpoint. No second
    // provider request, no quota, no automatic retry, and no historical
    // fallback receipt mutation. Keep injected mocks unchanged by default.
    if(!deps.localZeroCall||deps.enableEditorialRescue===true){
     const editorial=localFn(item,'',{}, {editorial:true,linkedReason:true,identityExpansion:true,verifiedIntent:true});
     if((verifiedCaptionEditorialRescue(item,editorial)||verifiedTitleSignalEditorialRescue(item,editorial))
       &&provenLocalCopy(item,editorial))return publish(editorial);
     if(editorial?.ok&&!provenLocalCopy(item,editorial)&&!paidSemanticAllowed)
       return localBlockedResponse(res,'source_verified_copy_unavailable');
    }
    if(baselineUnbound&&!paidSemanticAllowed){
     // Fail closed before any paid/free model fallback or quota claim.
     return res.status(409).json({
      ok:false,pending:false,version:'super-urenavi-v3-conditional-preview',
      quality:{status:'blocked',text:'',reasons:['source_quote_not_exact']},
      variants:[],groq:{totalCalls:0},resourceUsage:summarize(measurements),
      message:'original_source_evidence_unverified'
     });
    }
   }
   const apiKey=String(process.env.GROQ_API_KEY||'');
   const rawProvider=deps.provider||createProvider({apiKey,model});
   // Tests can inject an isolated store. Real Preview requests always coordinate
   // across products, tabs and Vercel instances before consuming quota or tokens.
   const budgetStore=deps.budgetStore||(!deps.provider&&apiKey?createBudgetStore(db,(isProduction?'production|':'preview|')+apiKey):null);
   const baseProvider=budgetStore?withSharedBudget(rawProvider,{store:budgetStore,now:deps.now}):rawProvider;
   // Explicit Preview-only integration: never replace the source-verified local
   // path, never turn a policy precheck into provider authorization. A missing
   // trusted backend halts BEFORE the existing per-request quota claim.
   const useCapacityGate=isPreview&&process.env.URENAVI_CAPACITY_PREVIEW_GATE==='true';
   const backend=deps.capacityBackend||(useCapacityGate&&!deps.provider
     ?require('./urenavi-core/multitenant-capacity-backend').createCapacityBackend(db):null);
   if(useCapacityGate&&(!backend||typeof backend.dbRpc!=='function'
       ||typeof backend.getCapacity!=='function'))
    return res.status(503).json({ok:false,pending:false,message:'capacity_backend_unavailable',
      quality:{status:'blocked',text:''},variants:[],groq:{totalCalls:0}});
   const capacityIdentity=useCapacityGate
    ?await require('./urenavi-core/multitenant-paid-identity').resolveCapacityIdentity(req,auth,{
       authenticateSearchUser:deps.authenticateSearchUser||authenticateSearchUser
     }):auth;
   if(useCapacityGate&&!capacityIdentity.ok)
    return res.status(503).json({ok:false,pending:false,message:'capacity_identity_unavailable',
      quality:{status:'blocked',text:''},variants:[],groq:{totalCalls:0}});
   const guardedProvider=useCapacityGate
    ?require('./urenavi-core/multitenant-protected-provider').protectProvider(baseProvider,{
       identity:capacityIdentity,dbRpc:backend.dbRpc,capacityForStage:backend.getCapacity,item
     })
    :baseProvider;
   let requestCalls=0;
   const provider=meteredProvider(guardedProvider,{owner,log:row=>{requestCalls+=row.calls;record(row);}});
   const consumeQuota=async stage=>{
    if(!apiKey&&!deps.provider){const e=new Error('GROQ_API_KEY is not configured');e.status=503;throw e;}
    // The atomic provider+tenant reservation is the sole request budget when
    // the Preview capacity gate is enabled. Do not consume the legacy daily
    // counter before the actual DB admission decision.
    if(useCapacityGate)return true;
    return quota(stage,isProduction?paidLimit:undefined);
   };
   const args={item,store,provider,consumeQuota,runKey,now:deps.now,readOnly:body.statusOnly===true};
   let out=await advance(args);
   // Continue a distinct verification stage only when no waiting is required.
   // Never sleep, retry a failed provider request or start a timer here.
   for(let step=1;step<4&&out.pending&&out.retryAfterMs===0&&!args.readOnly;step++)out=await advance(args);
   const ready=out.ok===true&&out.quality?.status==='ready'&&out.pending===false;
   const draft=out.diagnostics?.draft;
   if(requestCalls===0)record(measure({model:provider.model,calls:0,owner,stage:'cache'}));
   return res.status(out.pending?202:200).json({...out,resourceUsage:summarize(measurements),product:ready?draft?.product:null,sentences:ready?draft?.sentences:[],variants:ready?out.variants:[],quality:ready?out.quality:{...out.quality,text:''}});
  }catch(e){
   const status=e.status===429?429:e.status===503?503:502,retryAfterMs=Number(e.retryAfterMs)||0;
   if(retryAfterMs>0)res.setHeader('Retry-After',String(Math.ceil(retryAfterMs/1000)));
   return res.status(status).json({resourceUsage:measurements.length?summarize(measurements):null,ok:false,pending:false,message:status===429?'AI provider or daily limit reached':'copy_verification_unavailable',retryAfterMs,stage:e.stage||null,upstreamStatus:e.status||null});
  }
 };
}
module.exports=createHandler();
module.exports.createHandler=createHandler;
module.exports.provenLocalCopy=provenLocalCopy;
