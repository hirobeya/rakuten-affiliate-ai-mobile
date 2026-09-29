'use strict';

const {authorize,db}=require('../lib/billing');
const {createCacheStore}=require('../lib/super-urenavi-cache');
const {analyzeProductV3}=require('../lib/super-urenavi-v3-engine');
const {createV3Groq,DEFAULT_MODEL}=require('../lib/super-urenavi-v3-groq');
const {composeVariants}=require('../lib/super-urenavi-v3-copy');
const {validateUnderstanding}=require('../lib/super-urenavi-v3-understanding');
const {logAiUsageMetric}=require('../lib/super-urenavi-v3-metrics');
const legacy=require('../lib/room-ai-handler');
const {preprocessCaption}=require('../lib/room-ai');

const DEFAULT_DAILY_LIMIT=200;
const PREVIEW_NAMESPACE='__v3_preview__:';
function json(res,status,body){res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');return res.status(status).json(body);}
function namespacedStore(base){const keyArgs=x=>({...x,itemCode:PREVIEW_NAMESPACE+String(x?.itemCode||'')});return{loadProduct:x=>base.loadProduct(keyArgs(x)),saveProduct:x=>base.saveProduct(keyArgs(x))};}
async function consumeQuota(stage){
 const limitRaw=Number(process.env.GROQ_ROOM_DAILY_LIMIT||DEFAULT_DAILY_LIMIT),limit=Number.isSafeInteger(limitRaw)&&limitRaw>0?limitRaw:DEFAULT_DAILY_LIMIT;
 const result=await db('rpc/urenavi_consume_ai_daily_limit',{method:'POST',body:JSON.stringify({p_limit:limit})});
 const allowed=result===true||result?.allowed===true;console.log('super urenavi v3 quota',JSON.stringify({stage,allowed,limit}));return allowed;
}
function compact(v=''){return String(v||'').replace(/\s+/g,' ').trim();}
function sourceFor(item,quote){const q=compact(quote);if(q&&String(item?.itemName||'').includes(q))return'itemName';if(q&&String(item?.itemCaption||'').includes(q))return'itemCaption';return'itemCaption';}
function legacyImageToV3Raw(raw={}){
 const p=raw?.productType||{},specific=compact(p.value),quote=compact(p.evidence||p.value);
 const rows=[...(Array.isArray(raw?.features)?raw.features:[]),...(Array.isArray(raw?.sellingPoints)?raw.sellingPoints:[])];
 const seen=new Set(),attributes=[];
 for(const row of rows){const evidence=compact(row?.evidence),text=compact(row?.text);if(!evidence||seen.has(evidence))continue;seen.add(evidence);attributes.push({name:text||evidence,value:evidence,unit:'',qualifier:'',valueType:'text',quote:evidence});if(attributes.length>=3)break;}
 return{productType:{specific,general:specific,quote},attributes,decisionAxes:attributes.length?[{text:`${specific||'商品'}を選ぶときの確認ポイント`,attributeRefs:attributes.map((_,i)=>i)}]:[],appeals:[],hooks:[]};
}
async function tryImageFallback({item,apiKey,model,quotaFn}){
 if(!item.imageUrl)return null;
 if(!(await quotaFn('image'))){const e=new Error('urenavi_ai_quota');e.status=429;e.stage='image';e.quotaSource='urenavi';throw e;}
 const image=await legacy.loadImageDataUrl(item.imageUrl);if(!image?.available)return null;
 const processed=preprocessCaption(item.itemCaption||'');
 const result=await legacy.defaultCallGroq({apiKey,model,itemName:item.itemName,itemCaption:processed,itemPrice:item.itemPrice,imageDataUrl:image.dataUrl,maxOutputTokens:360});
 const mapped=legacyImageToV3Raw(result?.raw||{}),validation=validateUnderstanding(mapped,item);
 return{raw:mapped,validation,model:result?.model||model,usage:result?.usage||null};
}
function legacyContract(payload,item){
 const productType=payload?.productType||{},attrs=Array.isArray(payload?.attributes)?payload.attributes:[],verified=Array.isArray(payload?.verifiedAppeals)?payload.verifiedAppeals:[];
 const copy=Array.isArray(payload?.variants)?compact(payload.variants[0]?.text):'';
 const features=attrs.map(a=>({text:compact(a?.quote||a?.value),evidence:compact(a?.quote),source:sourceFor(item,a?.quote),valid:true,eligibleForPost:true,eligibleForCopyEvidence:true})).filter(x=>x.text&&x.evidence);
 const sellingPoints=verified.filter(a=>a?.verification?.supported===true).map(a=>({text:compact(a?.text),evidence:compact(attrs[a?.attributeRefs?.[0]]?.quote),source:sourceFor(item,attrs[a?.attributeRefs?.[0]]?.quote),valid:true,eligibleForPost:false,eligibleForCopyEvidence:false})).filter(x=>x.text);
 return{...payload,validation:{mode:payload?.ok&&copy?'simple':'fallback',confidence:payload?.ok&&copy?'high':'low',imageAvailable:Boolean(payload?.imageFallback),productType:{value:compact(productType?.specific||productType?.general),source:sourceFor(item,productType?.quote),evidence:compact(productType?.quote),valid:productType?.valid===true},features,sellingPoints,unknowns:[],reasons:Array.isArray(payload?.validationReasons)?payload.validationReasons:[]},_v3Copy:copy,_v3Tier:payload?.tier||'',_v3CopyQuality:payload?.copyQuality||null,_v3Groq:payload?.groq||null,_v3CacheStatus:payload?.cacheStatus||null};
}
function allowedAuth(auth,runtimeEnv,previewOnly){
 if(runtimeEnv==='production'&&previewOnly)return{ok:false,message:'not_found',status:404};
 if(!auth?.ok)return{ok:false,message:'access_required'};
 if(runtimeEnv==='preview'&&auth.plan!=='owner')return{ok:false,message:'owner_preview_only'};
 if(runtimeEnv==='production'&&!['base','pro','owner'].includes(String(auth.plan||'')))return{ok:false,message:'paid_plan_required'};
 return{ok:true};
}
function createHandler(deps={}){
 const authorizeFn=deps.authorize||authorize,baseStore=deps.store||createCacheStore(db),quotaFn=deps.consumeQuota||consumeQuota;
 const previewOnly=deps.previewOnly!==false,legacyResponse=deps.legacyResponse===true;
 return async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{message:'Method not allowed'});
  const runtimeEnv=String(process.env.VERCEL_ENV||'');if(!['preview','production'].includes(runtimeEnv))return json(res,404,{message:'Not found'});
  const started=Date.now();
  try{
   const auth=await authorizeFn(req),access=allowedAuth(auth,runtimeEnv,previewOnly);if(!access.ok)return json(res,access.status||403,{message:access.message});
   const body=req.body&&typeof req.body==='object'?req.body:{},item={itemCode:String(body.itemCode||'').trim().slice(0,300),itemName:String(body.itemName||'').trim().slice(0,1000),itemCaption:String(body.itemCaption||'').slice(0,12000),itemPrice:Number(body.itemPrice)||0,imageUrl:String(body.imageUrl||'').trim()};
   if(!item.itemName)return json(res,400,{message:'itemName is required'});
   const store=runtimeEnv==='preview'?namespacedStore(baseStore):baseStore;
   const model=String(process.env.GROQ_ROOM_MODEL||DEFAULT_MODEL).trim()||DEFAULT_MODEL;let groq=deps.groq;const apiKey=String(process.env.GROQ_API_KEY||'').trim();
   if(!groq){if(!apiKey)return json(res,503,{message:'GROQ_API_KEY is not configured'});groq=createV3Groq({apiKey,model});}
   let analysis=await analyzeProductV3({item,store,model,consumeQuota:quotaFn,callPass1:groq.callPass1});let imageCalls=0,imageFallback=false;
   if(!analysis.validation?.valid&&item.imageUrl&&apiKey){const imageResult=await tryImageFallback({item,apiKey,model,quotaFn});if(imageResult?.validation?.valid){imageCalls=1;imageFallback=true;analysis={...analysis,ok:true,source:'image_fallback',validation:imageResult.validation,verifiedAppeals:[],qualityGate:{ready:false,needsGroq:false,reasons:[],groundedAppealCount:0,strongAppealCount:0,specificHookCount:0},groq:{...analysis.groq,totalCalls:(analysis.groq?.totalCalls||0)+1}};}}
   const copy=composeVariants({item,analysis});
   const payload={ok:analysis.ok&&copy.quality?.copyReady===true,version:'super-urenavi-v3-sale',model,productType:analysis.validation?.productType||null,attributes:analysis.validation?.attributes||[],decisionAxes:analysis.validation?.decisionAxes||[],verifiedAppeals:analysis.verifiedAppeals||[],validationReasons:analysis.validation?.reasons||[],qualityGate:analysis.qualityGate||null,copyQuality:copy.quality||null,groq:analysis.groq,imageFallback,cacheStatus:analysis.cacheStatus,tier:copy.tier,variants:copy.variants};
   payload.metric=logAiUsageMetric({route:analysis.source,cacheStatus:analysis.cacheStatus,pass1Calls:analysis.groq.pass1Calls,pass2Calls:0,imageCalls,outputTier:copy.tier,hookType:copy.variants[0]?.hookType||'none',decisionAxis:analysis.validation?.decisionAxes?.[0]?.text||'',machineValidationPassed:analysis.validation?.valid===true,copied:false,elapsedMs:Date.now()-started});
   return json(res,200,legacyResponse?legacyContract(payload,item):payload);
  }catch(error){
   const status=error?.status===429?429:502,quotaSource=error?.quotaSource||((status===429&&error?.stage)?'upstream_or_unknown':null),retryAfterMs=Number(error?.retryAfterMs)||0;if(retryAfterMs>0)res.setHeader('Retry-After',String(Math.ceil(retryAfterMs/1000)));
   const groq=error?.groq||{pass1Calls:0,pass2Calls:0,totalCalls:0};console.warn('urenavi v3 failed',JSON.stringify({status,stage:error?.stage,quotaSource,groq,retryAfterMs}));
   return json(res,status,{groq,cacheStatus:error?.cacheStatus||null,retryAfterMs,message:status===429?(quotaSource==='urenavi'?'Urenavi AI quota reached':'Groq/upstream rate limit reached'):'v3 analysis failed',quotaSource,stage:error?.stage||null,upstreamStatus:error?.status||null,fallback:true});
  }
 };
}
module.exports=createHandler();module.exports.createHandler=createHandler;module.exports.namespacedStore=namespacedStore;module.exports.legacyImageToV3Raw=legacyImageToV3Raw;module.exports.legacyContract=legacyContract;module.exports.allowedAuth=allowedAuth;
