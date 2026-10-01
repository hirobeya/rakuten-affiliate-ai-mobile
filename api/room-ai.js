'use strict';

const {authorize,db}=require('../lib/billing');
const {createCacheStore}=require('../lib/super-urenavi-cache');
const {loadImageDataUrl}=require('../lib/room-ai-handler');
const {
  DEFAULT_MODEL,MIN_DESCRIPTION_CHARS,PROMPT_VERSION,
  prepareInput,effectiveTextLength,callGroqOnce,inspectOutput
}=require('../lib/room-post-generator-v1');

const DEFAULT_DAILY_LIMIT=200;
const MAX_OCR_TEXT=12000;
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
function norm(v=''){return String(v??'').normalize('NFKC').replace(/^#+/,'').replace(/\s+/g,'').toLowerCase();}
function clean(v=''){return String(v||'').normalize('NFKC').replace(/\u0000/g,'').trim();}
function groundedHashtags(tags,input,summary=''){
  const source=norm(input?.sourceText||'');
  const product=norm(summary);
  const out=[];
  for(const raw of Array.isArray(tags)?tags:[]){
    const body=String(raw||'').replace(/^#+/,'').trim();
    const n=norm(body);
    if(!n)continue;
    if(!source.includes(n)&&!(product&&n===product))continue;
    const tag='#'+body.replace(/\s+/g,'');
    if(!out.includes(tag))out.push(tag);
    if(out.length>=5)break;
  }
  return out;
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
      model,promptVersion:PROMPT_VERSION,schemaVersion:'room_post_single_pass_v2',
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
  return{ai,usedImage:Boolean(imageDataUrl),imageAttempted:Boolean(useImage)};
}
function parseJson(raw=''){
  const text=String(raw||'').trim();
  try{return JSON.parse(text)}catch{}
  const match=text.match(/\{[\s\S]*\}/);
  if(!match)return null;
  try{return JSON.parse(match[0])}catch{return null}
}
function sanitizeOcrResult(data){
  const candidates=(Array.isArray(data?.candidates)?data.candidates:[]).slice(0,3).map((x,i)=>({
    rank:i+1,
    productName:clean(x?.productName).slice(0,240),
    price:clean(x?.price).slice(0,80),
    rating:clean(x?.rating).slice(0,80),
    reviewCount:clean(x?.reviewCount).slice(0,80),
    ranking:clean(x?.ranking).slice(0,80),
    reasons:(Array.isArray(x?.reasons)?x.reasons:[]).map(clean).filter(Boolean).slice(0,4),
    facts:(Array.isArray(x?.facts)?x.facts:[]).map(clean).filter(Boolean).slice(0,6)
  })).filter(x=>x.productName);
  return {
    candidates,
    recommendedIndex:Number.isInteger(data?.recommendedIndex)&&data.recommendedIndex>=0&&data.recommendedIndex<candidates.length?data.recommendedIndex:0,
    recommendationReason:clean(data?.recommendationReason).slice(0,500),
    roomCopy:clean(data?.roomCopy).slice(0,1800),
    warnings:(Array.isArray(data?.warnings)?data.warnings:[]).map(clean).filter(Boolean).slice(0,8)
  };
}
async function runOcrTextMode({res,apiKey,model,text,workflow=false}){
  const input=clean(text);
  if(!input)return json(res,400,{message:'文字情報を貼り付けてください'});
  if(input.length>MAX_OCR_TEXT)return json(res,400,{message:`文字情報は${MAX_OCR_TEXT}文字以内にしてください`});
  if(!(await consumeQuota()))return json(res,429,{message:'AIの無料利用上限に達しました'});
  const legacySystem=`あなたは楽天ROOM投稿準備の補助エンジンです。入力は利用者のiPhoneが画像から抽出した文字列です。\n絶対条件:\n- 入力文字列だけを根拠にする。外部知識で補完しない。\n- 入力にない性能・効能・素材・サイズ・価格・ランキング・レビュー情報を作らない。\n- OCR誤認の可能性がある情報は断定せずwarningsへ入れる。\n- 複数商品がある場合は最大3商品に整理する。\n- 候補比較は価格、評価、レビュー件数、ランキング等、入力に実際にある項目だけを使う。\n- 「売れる」「必ず」「最強」等の断定をしない。\n- ROOM投稿文は選んだ候補について、入力で確認できた事実だけで簡潔に作る。\n- JSON以外を返さない。\n出力JSON schema:\n{"candidates":[{"productName":"","price":"","rating":"","reviewCount":"","ranking":"","reasons":[""],"facts":[""]}],"recommendedIndex":0,"recommendationReason":"","roomCopy":"","warnings":[""]}`;
  const system=`あなたは楽天ROOM投稿準備の補助エンジンです。入力は利用者のiPhoneが画像から抽出した文字列です。\n絶対条件:\n- 入力文字列だけを根拠にする。外部知識で補完しない。\n- 入力にない性能・効能・素材・サイズ・価格・ランキング・レビュー情報を作らない。\n- OCR誤認の可能性がある情報は断定せずwarningsへ入れる。\n- 複数商品がある場合は最大3商品に整理する。各候補のsourceTextはその商品だけの原文範囲を一字一句そのまま引用する。商品名、価格、評価、件数、ランキング、factsもsourceTextからの完全一致引用にする。原文で商品ごとの境界が分からない場合はcandidatesを空にする。factsには販促や効能ではなく仕様の引用を入れる。\n- 候補比較は価格、評価、レビュー件数、ランキング等、入力に実際にある項目だけを使う。\n- 「売れる」「必ず」「最強」等の断定をしない。\n- ROOM投稿文は選んだ候補について、入力で確認できた事実だけで簡潔に作る。\n- JSON以外を返さない。\n出力JSON schema:\n{"candidates":[{"productName":"","sourceText":"","price":"","rating":"","reviewCount":"","ranking":"","reasons":[""],"facts":[""]}],"recommendedIndex":0,"recommendationReason":"","roomCopy":"","warnings":[""]}`;
  const response=await fetch('https://api.groq.com/openai/v1/chat/completions',{
    method:'POST',
    headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
    body:JSON.stringify({model,temperature:0.1,max_completion_tokens:900,response_format:{type:'json_object'},messages:[{role:'system',content:workflow?system:legacySystem},{role:'user',content:input}]}),
    signal:AbortSignal.timeout(20000)
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    if(response.status===429&&response.headers.get('retry-after'))res.setHeader('Retry-After',response.headers.get('retry-after'));
    return json(res,response.status===429?429:502,{message:response.status===429?'AIの無料利用上限に達しました':'文字情報の整理に失敗しました'});
  }
  const parsed=parseJson(data?.choices?.[0]?.message?.content||'');
  if(!parsed)return json(res,502,{message:'AIの出力を読み取れませんでした'});
  const out=workflow?require('../public/ocr-workflow-core').sanitize(parsed,input):sanitizeOcrResult(parsed);
  if(!out.candidates.length&&!out.roomCopy)return json(res,422,{message:'商品情報を十分に読み取れませんでした',warnings:out.warnings});
  return json(res,200,{ok:true,mode:workflow?'ocr_workflow':'ocr_text',...out,model});
}

module.exports=async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{message:'Method not allowed'});
  const env=String(process.env.VERCEL_ENV||'');
  if(!['preview','production'].includes(env))return json(res,404,{message:'Not found'});
  try{
    const auth=await authorize(req);
    if(!accessAllowed(auth,env))return json(res,403,{message:env==='preview'?'owner_preview_only':'paid_plan_required'});
    const apiKey=String(process.env.GROQ_API_KEY||'').trim();
    if(!apiKey)return json(res,503,{message:'GROQ_API_KEY is not configured'});
    const model=String(process.env.GROQ_ROOM_MODEL||DEFAULT_MODEL).trim()||DEFAULT_MODEL;

    if(req.body?.mode==='ocr_workflow_post'){
      if(env!=='preview'||auth.plan!=='owner')return json(res,404,{message:'Not found'});
      const result=await require('../lib/ocr-workflow-post').preparePost({body:req.body,apiKey,model,consumeQuota});
      return json(res,200,result);
    }

    if(['ocr_text','ocr_workflow'].includes(req.body?.mode)){
      if(env!=='preview'||auth.plan!=='owner')return json(res,404,{message:'Not found'});
      return await runOcrTextMode({res,apiKey,model,text:req.body?.text,workflow:req.body?.mode==='ocr_workflow'});
    }

    const input=prepareInput(req.body&&typeof req.body==='object'?req.body:{});
    if(!input.itemName)return json(res,400,{message:'itemName is required'});
    const started=Date.now();
    const shortDescription=effectiveTextLength(input)<MIN_DESCRIPTION_CHARS;
    const firstWantsImage=shortDescription&&Boolean(input.imageUrl);
    const first=await runCall({apiKey,model,input,useImage:firstWantsImage});
    let raw=first.ai.raw;
    let calls=1;
    let route=first.usedImage?'image_first':'text';

    if(raw?.understood!==true&&!first.imageAttempted&&input.imageUrl){
      const second=await runCall({apiKey,model,input,useImage:true});
      raw=second.ai.raw;calls=2;route=second.usedImage?'text_then_image':'text_image_unavailable';
    }

    const inspection=inspectOutput(raw,input);
    const final={...inspection.final,hashtags:groundedHashtags(inspection.final?.hashtags,input,inspection.final?.product_summary)};
    inspection.final=final;
    const copy=combinedCopy(final);
    console.log('room-post raw',JSON.stringify({itemCode:input.itemCode,model,route,calls,raw}));
    console.log('room-post final',JSON.stringify({itemCode:input.itemCode,model,route,calls,removedSentenceCount:inspection.removedSentenceCount,final}));
    await saveGeneration(input,model,raw,inspection,route);

    if(raw?.understood!==true){
      return json(res,422,{ok:false,understood:false,message:'情報不足のため生成できません',post_text:'',hashtags:[],facts_used:[],_v3Copy:'',copyReady:false,model,route,calls,elapsedMs:Date.now()-started});
    }
    if(!copy){
      return json(res,502,{ok:false,understood:true,message:'事実確認を通過した本文がありません',post_text:'',hashtags:[],facts_used:final.facts_used,_v3Copy:'',copyReady:false,model,route,calls,elapsedMs:Date.now()-started});
    }

    return json(res,200,{
      ok:true,understood:true,product_summary:final.product_summary,facts_used:final.facts_used,
      post_text:final.post_text,hashtags:final.hashtags,_v3Copy:copy,copyReady:true,
      validation:compatibilityValidation(final),model,route,calls,
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
module.exports.groundedHashtags=groundedHashtags;
