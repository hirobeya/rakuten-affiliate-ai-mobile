'use strict';

const {authorize,db}=require('../lib/billing');
const {createCacheStore}=require('../lib/super-urenavi-cache');
const {loadImageDataUrl}=require('../lib/room-ai-handler');
const {
  DEFAULT_MODEL,MIN_DESCRIPTION_CHARS,PROMPT_VERSION,
  prepareInput,effectiveTextLength,callGroqOnce,inspectOutput
}=require('../lib/room-post-generator-v1');

const DEFAULT_DAILY_LIMIT=200;
const store=createCacheStore(db);

function json(res,status,body){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  return res.status(status).json(body);
}
async function consumeQuota(){
  const raw=Number(process.env.GROQ_ROOM_DAILY_LIMIT||DEFAULT_DAILY_LIMIT);
  const limit=Number.isSafeInteger(raw)&&raw>0?raw:DEFAULT_DAILY_LIMIT;
  const result=await db('rpc/urenavi_consume_ai_daily_limit',{method:'POST',body:JSON.stringify({p_limit:limit})});
  return result===true||result?.allowed===true;
}
function accessAllowed(auth,env){
  if(!auth?.ok)return false;
  if(env==='preview')return auth.plan==='owner';
  if(env==='production')return ['base','pro','owner'].includes(String(auth.plan||''));
  return false;
}
function combinedCopy(final){
  const post=String(final?.post_text||'').trim();
  const tags=Array.isArray(final?.hashtags)?final.hashtags.filter(Boolean).join(' '):'';
  return [post,tags].filter(Boolean).join('\n\n').trim();
}
function compatibilityValidation(final){
  return {
    mode:final?.understood?'simple':'fallback',
    confidence:final?.understood?'high':'low',
    productType:{value:String(final?.product_summary||''),source:'ai',evidence:'',valid:final?.understood===true},
    features:[],sellingPoints:[],unknowns:[],reasons:[]
  };
}
async function saveGeneration(input,model,rawResult,inspection,route){
  try{
    await store.saveProduct({
      itemCode:input.itemCode,itemName:input.itemName,
      itemCaption:[input.catchcopy,input.description].filter(Boolean).join('\n'),
      model,promptVersion:PROMPT_VERSION,schemaVersion:'room_post_single_pass_v1',
      rawAiJson:{raw_output:rawResult,final_output:inspection.final,removed_sentence_count:inspection.removedSentenceCount,route},
      resultStatus:inspection.final?.understood?'ok':'unknown'
    });
  }catch(error){console.warn('room-post log save unavailable',error?.message||'unknown');}
}
async function runCall({apiKey,model,input,useImage}){
  if(!(await consumeQuota())){const e=new Error('AI daily limit reached');e.status=429;throw e;}
  let imageDataUrl=null;
  if(useImage&&input.imageUrl){
    const image=await loadImageDataUrl(input.imageUrl);
    if(image?.available)imageDataUrl=image.dataUrl;
  }
  const ai=await callGroqOnce({apiKey,model,input,imageDataUrl});
  return{ai,usedImage:Boolean(imageDataUrl)};
}

module.exports=async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{message:'Method not allowed'});
  const env=String(process.env.VERCEL_ENV||'');
  if(!['preview','production'].includes(env))return json(res,404,{message:'Not found'});
  try{
    const auth=await authorize(req);
    if(!accessAllowed(auth,env))return json(res,403,{message:env==='preview'?'owner_preview_only':'paid_plan_required'});
    const input=prepareInput(req.body&&typeof req.body==='object'?req.body:{});
    if(!input.itemName)return json(res,400,{message:'itemName is required'});
    const apiKey=String(process.env.GROQ_API_KEY||'').trim();
    if(!apiKey)return json(res,503,{message:'GROQ_API_KEY is not configured'});
    const model=String(process.env.GROQ_ROOM_MODEL||DEFAULT_MODEL).trim()||DEFAULT_MODEL;
    const started=Date.now();
    const shortDescription=effectiveTextLength(input)<MIN_DESCRIPTION_CHARS;
    const firstWantsImage=shortDescription&&Boolean(input.imageUrl);
    let first=await runCall({apiKey,model,input,useImage:firstWantsImage});
    let raw=first.ai.raw;
    let calls=1;
    let route=first.usedImage?'image_first':'text';

    if(raw?.understood!==true&&!first.usedImage&&input.imageUrl){
      const second=await runCall({apiKey,model,input,useImage:true});
      raw=second.ai.raw;calls=2;route=second.usedImage?'text_then_image':'text';
    }

    const inspection=inspectOutput(raw,input);
    const final=inspection.final;
    const copy=combinedCopy(final);
    console.log('room-post raw',JSON.stringify({itemCode:input.itemCode,model,route,calls,raw}));
    console.log('room-post final',JSON.stringify({itemCode:input.itemCode,model,route,calls,removedSentenceCount:inspection.removedSentenceCount,final}));
    await saveGeneration(input,model,raw,inspection,route);

    if(raw?.understood!==true){
      return json(res,422,{ok:false,understood:false,message:'情報不足のため生成できません',post_text:'',hashtags:[],facts_used:[],_v3Copy:'',copyReady:false,model,route,calls,elapsedMs:Date.now()-started});
    }
    if(!copy){
      return json(res,422,{ok:false,understood:true,message:'検品後に表示できる投稿文が残りませんでした',post_text:'',hashtags:[],facts_used:final.facts_used,_v3Copy:'',copyReady:false,model,route,calls,elapsedMs:Date.now()-started});
    }

    return json(res,200,{
      ok:true,understood:true,product_summary:final.product_summary,facts_used:final.facts_used,
      post_text:final.post_text,hashtags:final.hashtags,_v3Copy:copy,copyReady:true,
      validation:compatibilityValidation(final),rawAiJson:raw,model,route,calls,
      removedSentenceCount:inspection.removedSentenceCount,elapsedMs:Date.now()-started,
      promptVersion:PROMPT_VERSION,descriptionThreshold:MIN_DESCRIPTION_CHARS
    });
  }catch(error){
    const timeout=error?.name==='AbortError'||/timeout|aborted/i.test(String(error?.message||''));
    const status=error?.status===429?429:timeout?504:502;
    if(error?.retryAfter)res.setHeader('Retry-After',String(error.retryAfter));
    console.warn('room-post failed',JSON.stringify({status,message:error?.message||'unknown'}));
    return json(res,status,{ok:false,copyReady:false,_v3Copy:'',message:status===429?'AIの利用上限に達しました':timeout?'AI生成が時間内に完了しませんでした':'AI生成に失敗しました'});
  }
};

module.exports.MIN_DESCRIPTION_CHARS=MIN_DESCRIPTION_CHARS;
module.exports.PROMPT_VERSION=PROMPT_VERSION;
module.exports.prepareInput=prepareInput;
module.exports.inspectOutput=inspectOutput;
