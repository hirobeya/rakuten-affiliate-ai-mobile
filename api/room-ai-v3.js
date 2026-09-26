'use strict';

const {authorize,db}=require('../lib/billing');
const {createCacheStore}=require('../lib/super-urenavi-cache');
const {analyzeProductV3}=require('../lib/super-urenavi-v3-engine');
const {createV3Groq,DEFAULT_MODEL}=require('../lib/super-urenavi-v3-groq');
const {composeVariants}=require('../lib/super-urenavi-v3-copy');
const {logMetric}=require('../lib/super-urenavi-v3-metrics');

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

      const apiKey=String(process.env.GROQ_API_KEY||'').trim();
      if(!apiKey) return json(res,503,{message:'GROQ_API_KEY is not configured'});
      const model=String(process.env.GROQ_ROOM_MODEL||DEFAULT_MODEL).trim()||DEFAULT_MODEL;
      const groq=deps.groq||createV3Groq({apiKey,model});

      const analysis=await analyzeProductV3({
        item,store,model,consumeQuota:quotaFn,
        callPass1:groq.callPass1,
        callPass2:groq.callPass2
      });
      const copy=composeVariants({item,analysis});
      const metric=logMetric({
        route:analysis.source,
        cacheStatus:analysis.cacheStatus,
        model,
        pass1Calls:analysis.groq.pass1Calls,
        pass2Calls:analysis.groq.pass2Calls,
        imageCalls:0,
        outputTier:copy.tier,
        hookType:copy.variants[0]?.hookType||'',
        productTypeValid:analysis.validation?.valid===true,
        machinePass:analysis.validation?.valid===true,
        copied:false,
        reason:analysis.pass2Status,
        elapsedMs:Date.now()-started
      });

      return json(res,200,{
        ok:analysis.ok,
        version:'super-urenavi-v3-preview',
        model,
        productType:analysis.validation?.productType||null,
        attributes:analysis.validation?.attributes||[],
        decisionAxes:analysis.validation?.decisionAxes||[],
        verifiedAppeals:analysis.verifiedAppeals||[],
        groq:analysis.groq,
        cacheStatus:analysis.cacheStatus,
        pass2Status:analysis.pass2Status,
        tier:copy.tier,
        variants:copy.variants,
        metric
      });
    }catch(error){
      const status=error?.status===429?429:502;
      return json(res,status,{
        message:status===429?'AI daily limit reached':'v3 analysis failed',
        stage:error?.stage||null,
        upstreamStatus:error?.status||null,
        fallback:true
      });
    }
  };
}

module.exports=createHandler();
module.exports.createHandler=createHandler;
module.exports.namespacedStore=namespacedStore;
