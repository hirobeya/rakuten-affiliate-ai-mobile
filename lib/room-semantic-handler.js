'use strict';
const {authorize,db}=require('./billing');
const {createCacheStore}=require('./super-urenavi-cache');
const {advance,VERSION}=require('./room-semantic-engine');
const {createProvider,DEFAULT_MODEL}=require('./room-semantic-provider');
function createHandler(deps={}){
 const authorizeFn=deps.authorize||authorize;
 const store=deps.store||createCacheStore(db);
 return async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  const reply=(status,data)=>res.status(status).json(data);
  if(req.method!=='POST')return reply(405,{message:'Method not allowed'});
  if(String(process.env.VERCEL_ENV||'')!=='preview')return reply(404,{message:'Not found'});
  let calls=0;
  try{
   const auth=await authorizeFn(req);
   if(!auth?.ok||auth.plan!=='owner')return reply(403,{message:'owner_preview_only'});
   const body=req.body&&typeof req.body==='object'?req.body:{};
   const item={itemCode:String(body.itemCode||'').trim().slice(0,300),itemName:String(body.itemName||'').trim().slice(0,1000),itemCaption:String(body.itemCaption||'').slice(0,12000),itemPrice:Number(body.itemPrice)||0};
   if(!item.itemName)return reply(400,{message:'itemName is required'});
   const model=String(process.env.GROQ_ROOM_MODEL||DEFAULT_MODEL).trim()||DEFAULT_MODEL;
   const provider=deps.provider||createProvider({apiKey:String(process.env.GROQ_API_KEY||'').trim(),model});
   const countedProvider={...provider,call:async(...args)=>{calls++;return provider.call(...args);}};
   const quota=deps.consumeQuota|| (async()=>{const n=Number(process.env.GROQ_ROOM_DAILY_LIMIT||200);const limit=Number.isSafeInteger(n)&&n>0?n:200;const result=await db('rpc/urenavi_consume_ai_daily_limit',{method:'POST',body:JSON.stringify({p_limit:limit})});return result===true||result?.allowed===true;});
   const data=await advance({item,store,provider:countedProvider,consumeQuota:quota,readOnly:body.statusOnly===true});
   return reply(data.pending?202:200,{...data,requestLlmCalls:calls,verifiedReuse:!data.pending&&data.ok&&calls===0,identityBasis:'reviewed_product_and_source'});
  }catch(error){
   const status=error?.status===429?429:502;
   return reply(status,{ok:false,pending:false,version:VERSION,message:status===429?'AIの利用上限に達しました。':'投稿文の生成・検証に失敗しました。',stage:error.stage||null,upstreamStatus:error.status||null,retryAfterMs:Number(error.retryAfterMs)||0,requestLlmCalls:calls,verifiedReuse:false});
  }
 };
}
module.exports={createHandler};
