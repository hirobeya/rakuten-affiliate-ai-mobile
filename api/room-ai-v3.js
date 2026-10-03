'use strict';

const {authorize,db}=require('../lib/billing');
const {createCacheStore}=require('../lib/super-urenavi-cache');
const {advance}=require('../lib/room-semantic-engine');
const {createProvider,DEFAULT_MODEL}=require('../lib/room-semantic-provider');
const {logAiUsageMetric}=require('../lib/super-urenavi-v3-metrics');

const DEFAULT_DAILY_LIMIT=200;
const PREVIEW_NAMESPACE='__v3_preview__:';

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
    try{
      const auth=await authorizeFn(req);
      if(!auth?.ok || auth.plan!=='owner') return json(res,403,{message:'owner_preview_only'});

      const body=req.body&&typeof req.body==='object'?req.body:{};
      const item={
        itemCode:String(body.itemCode||'').trim().slice(0,300),
        itemName:String(body.itemName||'').trim().slice(0,1000),
        itemCaption:String(body.itemCaption||'').slice(0,12000),
        itemPrice:Number(body.itemPrice)||0,
        imageUrl:String(body.imageUrl||'').trim()
      };
      if(!item.itemName) return json(res,400,{message:'itemName is required'});

      const model=String(process.env.GROQ_ROOM_V3_MODEL||DEFAULT_MODEL).trim()||DEFAULT_MODEL;
      let provider=deps.provider;
      if(!provider){
        const apiKey=String(process.env.GROQ_API_KEY||'').trim();
        if(!apiKey)return json(res,503,{message:'GROQ_API_KEY is not configured'});
        provider=createProvider({apiKey,model});
      }
      const runKey=body.evaluationRun===undefined?'':String(body.evaluationRun);
      if(runKey&&!/^[A-Za-z0-9_-]{1,80}$/.test(runKey))return json(res,400,{message:'invalid evaluationRun'});
      const analysis=await advance({item,store,provider,consumeQuota:quotaFn,runKey,now:deps.now||Date.now});
      const metric=logAiUsageMetric({route:'semantic_preview',cacheStatus:runKey?'evaluation':'source_cache',pass1Calls:analysis.groq.pass1Calls,pass2Calls:analysis.groq.pass2Calls,imageCalls:0,outputTier:analysis.ok?'A':'C',hookType:'scene',machineValidationPassed:analysis.diagnostics.machine?.ok===true,copied:false,elapsedMs:Date.now()-started});
      return json(res,analysis.pending?202:200,{...analysis,tier:analysis.ok?'A':'C',metric});

    }catch(error){
      const status=error?.status===429?429:502;
      return json(res,status,{
        message:status===429?'AI daily limit reached':'v3 analysis failed',
        stage:error?.stage||null,
        upstreamStatus:error?.status||null,
        failureReason:error?.failureReason|| (error?.name==='AbortError'?'upstream_timeout':'analysis_error'),
        upstreamDiagnostic:error?.safeError?{category:error.safeError.category,code:error.safeError.code,message:String(error.safeError.message||'').replace(/(?:gsk_|sk-)[A-Za-z0-9_-]+/g,'[redacted]').slice(0,500)}:null,
        failedGeneration:error?.failedGeneration||null,
        usage:error?.usage||null,
        fallback:true
      });
    }
  };
}

module.exports=createHandler();
module.exports.createHandler=createHandler;
module.exports.namespacedStore=namespacedStore;
