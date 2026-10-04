'use strict';

const {authorize,db}=require('../lib/billing');
const {createCacheStore}=require('../lib/super-urenavi-cache');
const {analyzeProductV3}=require('../lib/super-urenavi-v3-engine');
const {createV3Groq,DEFAULT_MODEL}=require('../lib/super-urenavi-v3-groq');
const {composeVariants}=require('../lib/super-urenavi-v3-copy');
const {logAiUsageMetric}=require('../lib/super-urenavi-v3-metrics');

const DEFAULT_DAILY_LIMIT=200;
const PREVIEW_NAMESPACE='__v3_preview__:';
const EVALUATION_MODELS=new Set(['openai/gpt-oss-120b','openai/gpt-oss-20b']);

function json(res,status,body){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  return res.status(status).json(body);
}

function namespacedStore(base){
  const keyArgs=x=>({...x,itemCode:PREVIEW_NAMESPACE+String(x?.itemCode||'')});
  return {
    loadProduct:x=>base.loadProduct(keyArgs(x)),
    saveProduct:x=>base.saveProduct(keyArgs(x))
  };
}

async function consumeQuota(stage){
  const limitRaw=Number(process.env.GROQ_ROOM_DAILY_LIMIT||DEFAULT_DAILY_LIMIT);
  const limit=Number.isSafeInteger(limitRaw)&&limitRaw>0?limitRaw:DEFAULT_DAILY_LIMIT;
  const result=await db('rpc/urenavi_consume_ai_daily_limit',{
    method:'POST',
    body:JSON.stringify({p_limit:limit})
  });
  const allowed=result===true || result?.allowed===true;
  console.log('super urenavi v3 quota',JSON.stringify({stage,allowed,limit}));
  return allowed;
}

function createHandler(deps={}){
  const authorizeFn=deps.authorize||authorize;
  const baseStore=deps.store||createCacheStore(db);
  const store=deps.namespaced===false?baseStore:namespacedStore(baseStore);
  const quotaFn=deps.consumeQuota||consumeQuota;

  return async function handler(req,res){
    if(req.method!=='POST') return json(res,405,{message:'Method not allowed'});
    const runtimeEnv=String(process.env.VERCEL_ENV||'');
    if(runtimeEnv!=='preview') return json(res,404,{message:'Not found'});

    const started=Date.now();
    let activeModel=null;
    try{
      const auth=await authorizeFn(req);
      if(!auth?.ok || auth.plan!=='owner') return json(res,403,{message:'owner_preview_only'});

      const body=req.body&&typeof req.body==='object'?req.body:{};
      const runKey=body.evaluationRun===undefined?'':String(body.evaluationRun);
      if(runKey&&!/^[A-Za-z0-9_-]{1,80}$/.test(runKey)) return json(res,400,{message:'invalid evaluationRun'});
      if(body.evaluationModel!==undefined&&(!runKey||!EVALUATION_MODELS.has(body.evaluationModel))) return json(res,400,{message:'invalid evaluationModel'});

      const requestedModel=body.evaluationModel;
      const model=requestedModel||String(process.env.GROQ_ROOM_MODEL||DEFAULT_MODEL).trim()||DEFAULT_MODEL;
      activeModel=model;
      const item={
        itemCode:String(body.itemCode||'').trim().slice(0,300)+(runKey?':eval:'+runKey:''),
        itemName:String(body.itemName||'').trim().slice(0,1000),
        itemCaption:String(body.itemCaption||'').slice(0,12000),
        itemPrice:Number(body.itemPrice)||0,
        imageUrl:String(body.imageUrl||'').trim()
      };
      if(!item.itemName) return json(res,400,{message:'itemName is required'});

      if(body.statusOnly===true){
        return json(res,202,{
          ok:false,pending:true,retryAfterMs:0,phase:'not_started',
          version:'super-urenavi-v3-conditional-preview',model,
          groq:{pass1Calls:0,pass2Calls:0,totalCalls:0}
        });
      }

      let groq=deps.groq;
      if(!groq){
        const apiKey=String(process.env.GROQ_API_KEY||'').trim();
        const factory=deps.createGroq||createV3Groq;
        if(!deps.createGroq&&!apiKey) return json(res,503,{message:'GROQ_API_KEY is not configured'});
        groq=factory({apiKey,model});
      }

      const analysis=await analyzeProductV3({
        item,store,model,consumeQuota:quotaFn,
        callPass1:groq.callPass1,
        callPass2:groq.callPass2,
        deferPass2:false
      });
      const copy=composeVariants({item,analysis});
      const metric=logAiUsageMetric({
        route:analysis.source,
        cacheStatus:analysis.cacheStatus,
        pass1Calls:analysis.groq.pass1Calls,
        pass2Calls:analysis.groq.pass2Calls,
        imageCalls:0,
        outputTier:copy.tier,
        hookType:copy.variants[0]?.hookType||'none',
        decisionAxis:analysis.validation?.decisionAxes?.[0]?.text||'',
        machineValidationPassed:analysis.validation?.valid===true,
        copied:false,
        elapsedMs:Date.now()-started
      });

      return json(res,200,{
        ok:analysis.ok,
        pending:false,
        retryAfterMs:0,
        phase:analysis.pass2Status==='generated'?'verification':'generation',
        version:'super-urenavi-v3-conditional-preview',
        model,
        productType:analysis.validation?.productType||null,
        attributes:analysis.validation?.attributes||[],
        decisionAxes:analysis.validation?.decisionAxes||[],
        verifiedAppeals:analysis.verifiedAppeals||[],
        groq:analysis.groq,
        cacheStatus:analysis.cacheStatus,
        pass2Status:analysis.pass2Status,
        tier:copy.tier,
        quality:{status:copy.tier==='A'?'ready':'blocked',text:copy.variants[0]?.text||'',reasons:copy.reasons||[]},
        variants:copy.variants,
        metric
      });
    }catch(error){
      const status=error?.status===429?429:502;
      const retryAfterMs=Number(error?.retryAfterMs)||0;
      if(retryAfterMs>0) res.setHeader('Retry-After',String(Math.ceil(retryAfterMs/1000)));
      return json(res,status,{
        message:status===429?(error?.safeError?'AI provider rate limit reached':'AI daily limit reached'):'v3 analysis failed',
        retryAfterMs,
        version:'super-urenavi-v3-conditional-preview',
        model:activeModel,
        stage:error?.stage||null,
        upstreamStatus:error?.status||null,
        failureReason:error?.failureReason||'analysis_error',
        upstreamDiagnostic:error?.safeError?{category:error.safeError.category,code:error.safeError.code,message:String(error.safeError.message||'').slice(0,500)}:null,
        fallback:true
      });
    }
  };
}

module.exports=createHandler();
module.exports.createHandler=createHandler;
module.exports.namespacedStore=namespacedStore;
