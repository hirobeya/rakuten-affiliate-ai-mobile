'use strict';
const core=require('../public/ocr-workflow-core');
const generator=require('./room-post-generator-v1');
async function preparePost({body,apiKey,model,consumeQuota,call=generator.callGroqOnce}){
  const source=core.text(body?.sourceText);
  if(!source||source.length>12000){const e=new Error('商品の原文は1〜12000文字で入力してください。');e.status=400;throw e;}
  const safe=core.sanitize({candidates:[body?.candidate]},source).candidates[0];
  if(!safe){const e=new Error('選んだ商品の原文を照合できませんでした。');e.status=422;throw e;}
  const facts=(Array.isArray(body?.checkedFacts)?body.checkedFacts:[]).filter(x=>safe.facts.includes(x));
  if(!facts.length){const e=new Error('確認した仕様を1つ以上選んでください。');e.status=422;throw e;}
  const fallback=core.draft(safe,facts);
  // Only the chosen name and checked quotations enter generation. No image or URL is fetched.
  const input=generator.prepareInput({itemName:safe.productName,description:facts.join('\n')});
  if(!(await consumeQuota()))return {ok:true,copyReady:true,post_text:fallback,route:'local',message:'AI無料枠の上限のため、確認した仕様で文案を作りました。'};
  try{
    const response=await call({apiKey,model,input});
    const inspected=generator.inspectOutput(response.raw,input);
    if(!inspected.final.understood||!inspected.final.post_text)return {ok:true,copyReady:true,post_text:fallback,route:'local',message:'AI文案を採用できなかったため、確認した仕様で文案を作りました。'};
    return {ok:true,copyReady:true,post_text:inspected.final.post_text,route:'ai',facts_used:inspected.final.facts_used,removedSentenceCount:inspected.removedSentenceCount};
  }catch{return {ok:true,copyReady:true,post_text:fallback,route:'local',message:'AI処理が完了しなかったため、確認した仕様で文案を作りました。'};}
}
module.exports={preparePost};
