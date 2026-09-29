'use strict';
const {DEFAULT_MODEL,OUTPUT_SCHEMA,prepareInput,systemPrompt,inspectOutput}=require('../lib/room-post-generator-v1');
const {verifyPost}=require('../lib/room-post-verifier-v1');
const samples=[
 {id:'kettle',itemName:'電気ケトル 0.8L 50-100℃ 1℃単位 温度設定 保温',itemCaption:'容量0.8L。50〜100℃の範囲を1℃単位で温度設定できます。',itemPrice:8980,genreId:'562637'},
 {id:'bike-glove',itemName:'バイク グローブ 本革 防風 スマホ対応 山羊革 メンズ レディース',itemCaption:'山羊革を使用したバイク用グローブ。防風仕様、スマホ対応。',itemPrice:2980,genreId:'503190'},
 {id:'storage-bench',itemName:'収納ベンチ 折りたたみ 収納ボックス 耐荷重100kg 幅76cm',itemCaption:'座面下を収納スペースとして使える折りたたみ式収納ベンチ。幅76cm、耐荷重100kg。',itemPrice:3980,genreId:'100804'},
 {id:'pet-bag',itemName:'うんち袋 ペット用 200枚入り 箱型',itemCaption:'ペットの散歩やトイレ処理に使える袋。200枚入り。',itemPrice:1680,genreId:'101213'},
 {id:'shaver',itemName:'電気シェーバー メンズ 回転式 6枚刃 IPX4 約92g USB充電',itemCaption:'回転式6枚刃。商品重量約92g。防水性能IPX4。USB充電に対応。',itemPrice:3319,genreId:'100939'}
];
const verifyCases={
 shaver:'回転式6枚刃の電気シェーバー。\n重さ約92gなので、持ち運びや操作が軽くて楽です。\n防水性能IPX4があるので、シャワー中でも使えるのが便利。\nUSB充電に対応しているので、外出先でも充電しやすいです。',
 kettle:'0.8Lの電気ケトル。\n50〜100℃の範囲を1℃単位で温度設定できるので、飲み物に合わせて細かく温度を調整したい時に便利です。\n温度をきめ細かく決められるので、毎回同じ設定に合わせたいときに使いやすいです。'
};
const MODELS=new Set(['qwen/qwen3.8-27b','openai/gpt-oss-20b','openai/gpt-oss-120b']);
function outputText(data){
 if(typeof data?.output_text==='string'&&data.output_text.trim())return data.output_text;
 for(const out of data?.output||[]){
  if(out?.type!=='message')continue;
  for(const c of out?.content||[])if(typeof c?.text==='string'&&c.text.trim())return c.text;
 }
 return '';
}
async function callModel({apiKey,model,input}){
 const isOss=model.startsWith('openai/gpt-oss-');
 const reasoning=isOss?{effort:'low'}:{effort:'none'};
 const itemJson=JSON.stringify({itemName:input.itemName,catchcopy:input.catchcopy,description:input.description,itemPrice:input.itemPrice,reviewAverage:input.reviewAverage,reviewCount:input.reviewCount,genreId:input.genreId});
 const apiInput=isOss
  ?[{role:'user',content:[{type:'input_text',text:`${systemPrompt(input)}\n\n【商品データ】\n${itemJson}`}]}]
  :[{role:'system',content:[{type:'input_text',text:systemPrompt(input)}]},{role:'user',content:[{type:'input_text',text:itemJson}]}];
 const r=await fetch('https://api.groq.com/openai/v1/responses',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify({model,reasoning,input:apiInput,text:{format:{type:'json_schema',name:'urenavi_room_post_v1',strict:true,schema:OUTPUT_SCHEMA}},max_output_tokens:900})});
 const data=await r.json().catch(()=>({}));
 if(!r.ok){const e=new Error(data?.error?.message||`Groq request failed (${r.status})`);e.status=r.status;throw e;}
 const text=outputText(data);if(!text)throw new Error('Groq returned no structured message output');
 return{raw:JSON.parse(text),usage:data.usage||null};
}
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
 if(process.env.VERCEL_ENV!=='preview')return res.status(404).json({message:'Not found'});
 if(req.method!=='GET')return res.status(405).json({message:'Method not allowed'});
 const id=String(req.query?.id||'kettle');const item=samples.find(x=>x.id===id);if(!item)return res.status(400).json({message:'unknown sample'});
 const apiKey=String(process.env.GROQ_API_KEY||'').trim();if(!apiKey)return res.status(503).json({message:'GROQ_API_KEY missing'});
 const input=prepareInput(item);const started=Date.now();
 try{
  if(String(req.query?.mode||'')==='verify'){
   const postText=verifyCases[id];if(!postText)return res.status(400).json({message:'no verify case'});
   const verified=await verifyPost({apiKey,sourceText:input.sourceText,postText});
   return res.status(200).json({temporary:true,mode:'verify',id,elapsedMs:Date.now()-started,input:{itemName:input.itemName,description:input.description},postText,verified});
  }
  const requested=String(req.query?.model||'').trim();
  const configured=String(process.env.GROQ_ROOM_MODEL||DEFAULT_MODEL).trim()||DEFAULT_MODEL;
  const model=requested&&MODELS.has(requested)?requested:configured;
  const ai=await callModel({apiKey,model,input});const inspection=inspectOutput(ai.raw,input);
  return res.status(200).json({temporary:true,id,model,elapsedMs:Date.now()-started,input:{itemName:input.itemName,description:input.description},raw:ai.raw,final:inspection.final,removedSentenceCount:inspection.removedSentenceCount});
 }catch(error){return res.status(error?.status||502).json({temporary:true,id,error:String(error?.message||'failed'),status:error?.status||null,elapsedMs:Date.now()-started});}
};
