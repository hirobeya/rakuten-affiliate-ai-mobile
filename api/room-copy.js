'use strict';
const {authorize,db}=require('../lib/billing');
const {createCacheStore}=require('../lib/super-urenavi-cache');
const {advance}=require('../lib/room-semantic-engine');
const {createProvider,DEFAULT_MODEL}=require('../lib/room-semantic-provider');
const {localZeroCall}=require('./room-ai-v3');
const {measure,logger,meteredProvider}=require('../lib/room-copy-cost');
const models=new Set(['openai/gpt-oss-120b','openai/gpt-oss-20b']);
function createHandler(deps={}){
 const authFn=deps.authorize||authorize,store=deps.store||createCacheStore(db),log=deps.logCost||logger;
 const quota=deps.consumeQuota||(async()=>{
  const n=Number(process.env.GROQ_ROOM_DAILY_LIMIT||200);
  const result=await db('rpc/urenavi_consume_ai_daily_limit',{method:'POST',body:JSON.stringify({p_limit:Number.isSafeInteger(n)&&n>0?n:200})});
  return result===true||result?.allowed===true;
 });
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({message:'Method not allowed'});
  if(process.env.VERCEL_ENV!=='preview')return res.status(404).json({message:'Not found'});
  try{
   const auth=await authFn(req);
   if(!auth?.ok||auth.plan!=='owner')return res.status(403).json({message:'owner_preview_only'});
   const body=req.body&&typeof req.body==='object'?req.body:{};
   if(typeof body.itemName!=='string'||!body.itemName.trim()||body.itemName.length>1000||typeof body.itemCaption!=='string'||body.itemCaption.length>12000)return res.status(400).json({message:'invalid_product_source'});
   const runKey=body.evaluationRun===undefined?'':String(body.evaluationRun);
   if(runKey&&!/^[A-Za-z0-9_-]{1,80}$/.test(runKey))return res.status(400).json({message:'invalid_evaluation_run'});
   if(body.evaluationModel!==undefined&&(!runKey||!models.has(body.evaluationModel)))return res.status(400).json({message:'invalid_evaluation_model'});
   const model=body.evaluationModel||String(process.env.GROQ_ROOM_MODEL||DEFAULT_MODEL).trim();
   const owner=String(auth.user?.email||auth.user?.id||'');
   if(!owner)return res.status(401).json({message:'account_identity_required'});
   const item={itemCode:String(body.itemCode||'').slice(0,300),itemName:body.itemName.trim(),itemCaption:body.itemCaption,itemPrice:Number(body.itemPrice)||0};
   // Preserve the already tested, source-grounded zero-call engine. Its old
   // local contract remains explicit; never invent acts_on to re-label it.
   if(!runKey&&body.statusOnly!==true){
    const local=(deps.localZeroCall||localZeroCall)(item);
    if(local?.ok&&local.quality?.status==='ready'&&local.model==='local'&&local.groq?.totalCalls===0){log(measure({model:'local',calls:0,owner,stage:'local'}));return res.status(200).json(local);}
   }
   const apiKey=String(process.env.GROQ_API_KEY||'');
   const baseProvider=deps.provider||createProvider({apiKey,model});
   let requestCalls=0;
   const provider=meteredProvider(baseProvider,{owner,log:row=>{requestCalls+=row.calls;log(row);}});
   const consumeQuota=async stage=>{
    if(!apiKey&&!deps.provider){const e=new Error('GROQ_API_KEY is not configured');e.status=503;throw e;}
    return quota(stage);
   };
   const args={item,store,provider,consumeQuota,runKey,readOnly:body.statusOnly===true};
   let out=await advance(args);
   // Continue a distinct verification stage only when no waiting is required.
   // Never sleep, retry a failed provider request or start a timer here.
   for(let step=1;step<4&&out.pending&&out.retryAfterMs===0&&!args.readOnly;step++)out=await advance(args);
   const ready=out.ok===true&&out.quality?.status==='ready'&&out.pending===false;
   const draft=out.diagnostics?.draft;
   if(requestCalls===0)log(measure({model:provider.model,calls:0,owner,stage:'cache'}));
   return res.status(out.pending?202:200).json({...out,product:ready?draft?.product:null,sentences:ready?draft?.sentences:[],variants:ready?out.variants:[],quality:ready?out.quality:{...out.quality,text:''}});
  }catch(e){
   const status=e.status===429?429:e.status===503?503:502,retryAfterMs=Number(e.retryAfterMs)||0;
   if(retryAfterMs>0)res.setHeader('Retry-After',String(Math.ceil(retryAfterMs/1000)));
   return res.status(status).json({ok:false,pending:false,message:status===429?'AI provider or daily limit reached':'copy_verification_unavailable',retryAfterMs,stage:e.stage||null,upstreamStatus:e.status||null});
  }
 };
}
module.exports=createHandler();
module.exports.createHandler=createHandler;
