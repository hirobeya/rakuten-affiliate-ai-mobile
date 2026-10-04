'use strict';

const {authorize,db}=require('../lib/billing');
const {validateAiExtraction}=require('../lib/room-ai');
const {createCacheStore}=require('../lib/super-urenavi-cache');
const {analyzeProductV3}=require('../lib/super-urenavi-v3-engine');
const {createV3Groq,DEFAULT_MODEL}=require('../lib/super-urenavi-v3-groq');
const {composeVariants}=require('../lib/super-urenavi-v3-copy');
const {logAiUsageMetric}=require('../lib/super-urenavi-v3-metrics');
const {resolveLocalUnderstanding}=require('../lib/super-urenavi-router');
const localTypeData=require('../data/local-product-types.json');
const structured=require('../public/structured-room-copy');

const DEFAULT_DAILY_LIMIT=200;
const PREVIEW_NAMESPACE='__v3_preview__:';
const EVALUATION_MODELS=new Set(['openai/gpt-oss-120b','openai/gpt-oss-20b']);

function normalize(value=''){
  return String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
}

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

function accessoryScoped(title,value){
  const t=normalize(title),v=normalize(value);
  const at=t.indexOf(v);
  if(at<0) return true;
  const before=t.slice(Math.max(0,at-10),at);
  const after=t.slice(at+v.length,Math.min(t.length,at+v.length+14));
  return /(?:交換用|替え)\s*$/.test(before)
    || /^\s*(?:用|専用)\s*(?:ケース|カバー|ポーチ|ホルダー|フィルター|アダプター|ケーブル|交換|替え)/.test(after);
}

function sharedTypeSuffixes(){
  const types=(localTypeData.productTypes||[]).map(normalize).filter(Boolean);
  const out=new Set();
  for(let i=0;i<types.length;i++){
    for(let j=i+1;j<types.length;j++){
      const a=[...types[i]],b=[...types[j]];
      let n=0;
      while(n<a.length&&n<b.length&&a[a.length-1-n]===b[b.length-1-n]) n++;
      if(n>=4) out.add(a.slice(a.length-n).join(''));
    }
  }
  return [...out].sort((a,b)=>b.length-a.length);
}

const TYPE_SUFFIXES=sharedTypeSuffixes();

function validateLiteralIdentity(item,value){
  const title=normalize(item?.itemName),identity=normalize(value);
  if(!identity||!title.includes(identity)||accessoryScoped(title,identity)) return null;
  const raw={productType:{value:identity,source:'itemName',evidence:identity},features:[],sellingPoints:[],confidence:'high'};
  const validation=validateAiExtraction(raw,{itemName:title,itemCaption:item?.itemCaption||''},{imageAvailable:false});
  if(validation?.productType?.valid!==true||!['simple','simple_partial'].includes(validation.mode)) return null;
  return {raw,validation,version:(localTypeData.version||'local-types')+'-literal-source'};
}

function resolveLiteralIdentity(item){
  const title=normalize(item?.itemName);
  if(!title) return null;
  const known=(localTypeData.productTypes||[])
    .map(normalize).filter(Boolean)
    .map(type=>({type,at:title.indexOf(type)}))
    .filter(x=>x.at>=0&&!accessoryScoped(title,x.type))
    .sort((a,b)=>a.at-b.at||b.type.length-a.type.length);

  // When the conservative dictionary resolver rejects a title only because multiple
  // concrete product nouns are present, the leading source noun is allowed if it is
  // itself an exact, independently valid product type. No synonym is invented.
  for(const hit of known){
    const validated=validateLiteralIdentity(item,hit.type);
    if(validated) return validated;
  }

  // For unseen wording such as "パソコンスタンド", derive only the noun ending
  // from suffixes that already occur in multiple known product types. The candidate
  // itself must be a contiguous title token and pass the same product-type validator.
  const tokens=title.split(/[\s,，、。!！?？()（）【】\[\]・\/／]+/).map(normalize).filter(Boolean);
  for(const token of tokens){
    if(token.length<4||token.length>24) continue;
    if(!TYPE_SUFFIXES.some(suffix=>token.endsWith(suffix)&&token.length>suffix.length)) continue;
    const validated=validateLiteralIdentity(item,token);
    if(validated) return validated;
  }
  return null;
}

function extractLiteralSpecs(item){
  // Zero-call publication is intentionally stricter than AI analysis. Rakuten captions
  // frequently contain related-product carousels and alternative specs, so a local
  // publication fact must come from the product title itself. Caption facts go to Groq.
  const parts=[{source:'itemName',text:normalize(item?.itemName)}].filter(x=>x.text);
  const out=[];
  const patterns=[
    /\d+(?:\.\d+)?\s*(?:~|〜|～|-)\s*\d+(?:\.\d+)?\s*(?:mAh|Ah|Wh|W|V|A|mm|cm|kg|g|ml|mL|L|GB|インチ)/gi,
    /\d+(?:\.\d+)?\s*(?:mm|cm|m)[×xX]\d+(?:\.\d+)?\s*(?:mm|cm|m)(?:[×xX]\d+(?:\.\d+)?\s*(?:mm|cm|m))?/gi,
    /\d+(?:\.\d+)?\s*(?:mAh|Ah|Wh|W|V|A|mm|cm|kg|mg|g|ml|mL|L|GB|インチ)/gi,
    /\d+(?:枚|個|本|袋|組|点|粒|錠|箱|足)(?:入り|入|セット|組)?/g
  ];
  for(const part of parts){
    for(const re of patterns){
      re.lastIndex=0;
      let match;
      while((match=re.exec(part.text))){
        const quote=normalize(match[0]);
        const start=match.index;
        const end=start+match[0].length;
        const before=part.text.slice(Math.max(0,start-1),start);
        const after=part.text.slice(end,end+1);
        // Never publish a numeric suffix cut from a larger number (H1,375mm), a
        // component cut from a dimension, or a count cut from a compound word (12本掛).
        if(/[0-9０-９.,，×xX]$/.test(before)||/^[0-9０-９A-Za-zぁ-んァ-ヶ一-龯×xX]/.test(after)) continue;
        if(!quote||out.some(x=>x.quote.toLowerCase()===quote.toLowerCase())) continue;
        out.push({quote,source:part.source,kind:/[×xX]/.test(quote)?'dimension':/枚|個|本|袋|組|点|粒|錠|箱|足/.test(quote)?'count':'numeric'});
      }
    }
  }
  return out.slice(0,6);
}

function neutralLiteralText(identity,facts,itemPrice){
  const rows=[identity];
  if(facts.length){
    rows.push('', '特徴👇');
    for(const fact of facts.slice(0,3)) rows.push('✓ '+fact.quote);
  }
  if(Number(itemPrice)>0) rows.push('', '価格：'+Number(itemPrice).toLocaleString('ja-JP')+'円');
  rows.push('', '※アフィリエイト広告を利用しています');
  return rows.join('\n');
}

function localZeroCall(item){
  const local=resolveLocalUnderstanding({itemName:item.itemName,itemCaption:item.itemCaption})||resolveLiteralIdentity(item);
  const identity=String(local?.raw?.productType?.value||'').trim();
  if(!identity || local?.validation?.productType?.valid!==true) return null;

  // Rich local copy is also title-only. The full caption remains available to the AI
  // fallback, but never gets a zero-call publication path where related products could
  // be mistaken for the current product.
  const titleOnlyItem={...item,itemCaption:''};
  const copy=structured.compose(titleOnlyItem,{identity});
  const understanding=copy?.understanding||{};
  const structuredMethod=String(understanding?.method||'');
  const structuredIdentity=String(understanding?.identity||'').trim();
  const structuredSafe=copy?.status==='ok'
    && ['type_definition','validated_identity'].includes(structuredMethod)
    && structuredIdentity===identity
    && String(copy.text||'').trim()
    && !structured.RISK.test(copy.text);

  const structuredFacts=structuredSafe&&Array.isArray(copy.facts)?copy.facts:[];
  const literalFacts=extractLiteralSpecs(titleOnlyItem);
  const facts=[];
  for(const fact of [...structuredFacts,...literalFacts]){
    if(!fact?.quote||facts.some(x=>normalize(x.quote).toLowerCase()===normalize(fact.quote).toLowerCase())) continue;
    facts.push(fact);
  }
  if(!facts.length) return null;

  const groundedValues=structuredSafe?(Array.isArray(copy.values)?copy.values:[]).filter(v=>
    String(v?.text||'').trim() && (v.factRefs||[v.factRef]).filter(Boolean).length
  ):[];
  const directAppeals=groundedValues.length?groundedValues:facts.slice(0,3).map(f=>({
    text:'仕様：'+f.quote,
    factRef:f.quote,
    factRefs:[f.quote],
    source:f.source
  }));
  if(!directAppeals.length) return null;

  // Rich wording is allowed only when structured copy independently understands the
  // product. Otherwise publish a neutral identity + exact-spec copy, with no inferred
  // benefit, outcome, audience or use case.
  const useStructuredText=structuredSafe&&structuredFacts.length>0;
  const text=useStructuredText?copy.text:neutralLiteralText(identity,facts,item.itemPrice);
  if(!String(text||'').trim()||structured.RISK.test(text)) return null;
  const hook=useStructuredText&&String(understanding.scene||'').trim()?String(understanding.scene).trim():identity;
  const hookType=hook===identity?'identity':'scene';
  const variant={index:1,hookType,hook,text};
  return {
    ok:true,pending:false,retryAfterMs:0,phase:'local',
    version:'super-urenavi-v3-conditional-preview',model:'local',
    productType:{specific:identity,general:(structuredSafe&&understanding.domain)||identity,quote:identity,valid:true},
    attributes:facts.map((f,index)=>({name:f.kind||'fact',value:f.quote,unit:'',qualifier:'',valueType:'text',quote:f.quote,sourceIndex:index})),
    decisionAxes:[],
    verifiedAppeals:directAppeals.map((v,index)=>({index,text:v.text,noHassle:'',scene:index===0&&hookType==='scene'?hook:'',attributeRefs:[],strength:index===0?3:2,verification:{required:false,supported:true,keepDirectFact:true,reason:'local_grounded_fact'}})),
    groq:{pass1Calls:0,pass2Calls:0,totalCalls:0},
    cacheStatus:'local',pass2Status:'not_needed',tier:'A',
    quality:{status:'ready',text,reasons:[]},
    variants:[variant],
    local:{route:'local',version:local.version||copy?.version||'literal-source',method:useStructuredText?structuredMethod:'literal_source',factCount:facts.length,valueCount:groundedValues.length}
  };
}

function createHandler(deps={}){
  const authorizeFn=deps.authorize||authorize;
  const baseStore=deps.store||createCacheStore(db);
  const store=deps.namespaced===false?baseStore:namespacedStore(baseStore);
  const quotaFn=deps.consumeQuota||consumeQuota;
  const localFn=deps.localZeroCall===undefined?localZeroCall:deps.localZeroCall;

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

      if(!runKey && typeof localFn==='function'){
        const localResult=localFn(item);
        if(localResult){
          localResult.metric=logAiUsageMetric({
            route:'local',cacheStatus:'local',pass1Calls:0,pass2Calls:0,imageCalls:0,
            outputTier:localResult.tier,hookType:localResult.variants?.[0]?.hookType||'none',decisionAxis:'',
            machineValidationPassed:true,copied:false,elapsedMs:Date.now()-started
          });
          return json(res,200,localResult);
        }
      }

      let groq=deps.groq;
      if(!groq){
        const createGroq=deps.createGroq||createV3Groq;
        const apiKey=String(process.env.GROQ_API_KEY||'').trim();
        if(!apiKey && !deps.createGroq) return json(res,503,{message:'GROQ_API_KEY is not configured'});
        groq=createGroq({apiKey,model});
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
module.exports.localZeroCall=localZeroCall;
module.exports.resolveLiteralIdentity=resolveLiteralIdentity;
module.exports.extractLiteralSpecs=extractLiteralSpecs;