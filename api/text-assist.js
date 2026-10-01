'use strict';

const {authorize}=require('../lib/billing');

const MODEL=String(process.env.GROQ_ROOM_MODEL||'openai/gpt-oss-120b').trim();
const MAX_TEXT=12000;

function json(res,status,body){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('Content-Type','application/json; charset=utf-8');
  return res.status(status).json(body);
}
function clean(v=''){return String(v||'').normalize('NFKC').replace(/\u0000/g,'').trim();}
function parseJson(raw=''){
  const text=String(raw||'').trim();
  try{return JSON.parse(text)}catch{}
  const m=text.match(/\{[\s\S]*\}/);
  if(!m)return null;
  try{return JSON.parse(m[0])}catch{return null}
}
function sanitize(data){
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

module.exports=async function handler(req,res){
  if(req.method!=='POST')return json(res,405,{message:'Method not allowed'});
  const env=String(process.env.VERCEL_ENV||'');
  if(env!=='preview')return json(res,404,{message:'Not found'});
  try{
    const auth=await authorize(req);
    if(!auth?.ok||auth.plan!=='owner')return json(res,403,{message:'owner_preview_only'});
    const input=clean(req.body?.text||'');
    if(!input)return json(res,400,{message:'文字情報を貼り付けてください'});
    if(input.length>MAX_TEXT)return json(res,400,{message:`文字情報は${MAX_TEXT}文字以内にしてください`});
    const apiKey=clean(process.env.GROQ_API_KEY);
    if(!apiKey)return json(res,503,{message:'GROQ_API_KEY is not configured'});

    const system=`あなたは楽天ROOM投稿準備の補助エンジンです。入力は利用者のiPhoneが画像から抽出した文字列です。\n絶対条件:\n- 入力文字列だけを根拠にする。外部知識で補完しない。\n- 入力にない性能・効能・素材・サイズ・価格・ランキング・レビュー情報を作らない。\n- OCR誤認の可能性がある情報は断定せずwarningsへ入れる。\n- 複数商品がある場合は最大3商品に整理する。\n- 候補比較は価格、評価、レビュー件数、ランキング等、入力に実際にある項目だけを使う。\n- 「売れる」「必ず」「最強」等の断定をしない。\n- ROOM投稿文は選んだ候補について、入力で確認できた事実だけで簡潔に作る。\n- JSON以外を返さない。\n出力JSON schema:\n{"candidates":[{"productName":"","price":"","rating":"","reviewCount":"","ranking":"","reasons":[""],"facts":[""]}],"recommendedIndex":0,"recommendationReason":"","roomCopy":"","warnings":[""]}`;

    const response=await fetch('https://api.groq.com/openai/v1/chat/completions',{
      method:'POST',
      headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model:MODEL,
        temperature:0.1,
        max_completion_tokens:900,
        response_format:{type:'json_object'},
        messages:[{role:'system',content:system},{role:'user',content:input}]
      }),
      signal:AbortSignal.timeout(20000)
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok){
      if(response.status===429&&response.headers.get('retry-after'))res.setHeader('Retry-After',response.headers.get('retry-after'));
      return json(res,response.status===429?429:502,{message:response.status===429?'AIの無料利用上限に達しました':'文字情報の整理に失敗しました'});
    }
    const parsed=parseJson(data?.choices?.[0]?.message?.content||'');
    if(!parsed)return json(res,502,{message:'AIの出力を読み取れませんでした'});
    const out=sanitize(parsed);
    if(!out.candidates.length&&!out.roomCopy)return json(res,422,{message:'商品情報を十分に読み取れませんでした',warnings:out.warnings});
    return json(res,200,{ok:true,...out,model:MODEL});
  }catch(error){
    const timeout=error?.name==='TimeoutError'||error?.name==='AbortError';
    return json(res,timeout?504:500,{message:timeout?'処理が時間内に完了しませんでした':'処理できませんでした'});
  }
};
