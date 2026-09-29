'use strict';
const {DEFAULT_MODEL,prepareInput,callGroqOnce,inspectOutput}=require('../lib/room-post-generator-v1');
const samples=[
 {id:'kettle',itemName:'電気ケトル 0.8L 50-100℃ 1℃単位 温度設定 保温',itemCaption:'容量0.8L。50〜100℃の範囲を1℃単位で温度設定できます。',itemPrice:8980,genreId:'562637'},
 {id:'bike-glove',itemName:'バイク グローブ 本革 防風 スマホ対応 山羊革 メンズ レディース',itemCaption:'山羊革を使用したバイク用グローブ。防風仕様、スマホ対応。',itemPrice:2980,genreId:'503190'},
 {id:'storage-bench',itemName:'収納ベンチ 折りたたみ 収納ボックス 耐荷重100kg 幅76cm',itemCaption:'座面下を収納スペースとして使える折りたたみ式収納ベンチ。幅76cm、耐荷重100kg。',itemPrice:3980,genreId:'100804'},
 {id:'pet-bag',itemName:'うんち袋 ペット用 200枚入り 箱型',itemCaption:'ペットの散歩やトイレ処理に使える袋。200枚入り。',itemPrice:1680,genreId:'101213'},
 {id:'shaver',itemName:'電気シェーバー メンズ 回転式 6枚刃 IPX4 約92g USB充電',itemCaption:'回転式6枚刃。商品重量約92g。防水性能IPX4。USB充電に対応。',itemPrice:3319,genreId:'100939'}
];
module.exports=async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
 if(process.env.VERCEL_ENV!=='preview')return res.status(404).json({message:'Not found'});
 if(req.method!=='GET')return res.status(405).json({message:'Method not allowed'});
 const id=String(req.query?.id||'kettle');const item=samples.find(x=>x.id===id);if(!item)return res.status(400).json({message:'unknown sample'});
 const apiKey=String(process.env.GROQ_API_KEY||'').trim();if(!apiKey)return res.status(503).json({message:'GROQ_API_KEY missing'});
 const model=String(process.env.GROQ_ROOM_MODEL||DEFAULT_MODEL).trim()||DEFAULT_MODEL;
 const input=prepareInput(item);const started=Date.now();
 try{
  const ai=await callGroqOnce({apiKey,model,input});const inspection=inspectOutput(ai.raw,input);
  return res.status(200).json({temporary:true,id,model,elapsedMs:Date.now()-started,raw:ai.raw,final:inspection.final,removedSentenceCount:inspection.removedSentenceCount});
 }catch(error){return res.status(error?.status||502).json({temporary:true,id,error:String(error?.message||'failed'),status:error?.status||null,elapsedMs:Date.now()-started});}
};
