'use strict';
const previewHandler=require('./room-ai-v3');
const {analyzeProductV3}=require('../lib/super-urenavi-v3-engine');
const {createV3Groq,DEFAULT_MODEL}=require('../lib/super-urenavi-v3-groq');
const {composeVariants}=require('../lib/super-urenavi-v3-copy');

const samples=[
 {id:'kettle',itemCode:'smoke:kettle',itemName:'電気ケトル 0.8L 50-100℃ 1℃単位 温度設定 保温',itemCaption:'容量0.8L。50〜100℃の範囲を1℃単位で温度設定できます。',itemPrice:8980},
 {id:'bike-glove',itemCode:'smoke:bike-glove',itemName:'バイク グローブ 本革 防風 スマホ対応 山羊革 メンズ レディース',itemCaption:'山羊革を使用したバイク用グローブ。防風仕様、スマホ対応。',itemPrice:2980},
 {id:'storage-bench',itemCode:'smoke:storage-bench',itemName:'収納ベンチ 折りたたみ 収納ボックス 耐荷重100kg 幅76cm',itemCaption:'座面下を収納スペースとして使える折りたたみ式収納ベンチ。幅76cm、耐荷重100kg。',itemPrice:3980},
 {id:'shaver',itemCode:'smoke:shaver',itemName:'電気シェーバー メンズ 回転式 6枚刃 IPX4 約92g USB充電',itemCaption:'回転式6枚刃。商品重量約92g。防水性能IPX4。USB充電に対応。',itemPrice:3319},
 {id:'pet-bag',itemCode:'smoke:pet-bag',itemName:'うんち袋 ペット用 200枚入り 箱型',itemCaption:'ペットの散歩やトイレ処理に使える袋。200枚入り。',itemPrice:1680}
];
function memory(){let row=null;return{async loadProduct(){return row;},async saveProduct(x){row={schema_version:x.schemaVersion,raw_ai_json:x.rawAiJson,model:x.model,result_status:x.resultStatus};}};}
async function runOne(item,groq,model){
 const started=Date.now();
 try{
  const analysis=await analyzeProductV3({item,store:memory(),model,consumeQuota:async()=>true,callPass1:groq.callPass1});
  const copy=composeVariants({item,analysis});
  return{id:item.id,itemName:item.itemName,ok:analysis.ok&&copy.quality?.copyReady===true,source:analysis.source,validationValid:analysis.validation?.valid===true,reasons:analysis.validation?.reasons||[],productType:analysis.validation?.productType||null,attributes:analysis.validation?.attributes||[],verifiedAppeals:analysis.verifiedAppeals||[],tier:copy.tier,quality:copy.quality,variants:copy.variants,groq:analysis.groq,elapsedMs:Date.now()-started};
 }catch(error){return{id:item.id,itemName:item.itemName,ok:false,error:String(error?.message||'failed'),status:error?.status||null,retryAfterMs:Number(error?.retryAfterMs)||0,elapsedMs:Date.now()-started};}
}
async function smoke(req,res){
 res.setHeader('Cache-Control','no-store');
 if(process.env.VERCEL_ENV!=='preview')return res.status(404).json({message:'Not found'});
 const apiKey=String(process.env.GROQ_API_KEY||'').trim();
 if(!apiKey)return res.status(503).json({message:'GROQ_API_KEY missing'});
 const model=String(process.env.GROQ_ROOM_MODEL||DEFAULT_MODEL).trim()||DEFAULT_MODEL;
 const groq=createV3Groq({apiKey,model});
 const requested=String(req.query?.id||'').trim();
 const selected=requested?samples.filter(x=>x.id===requested):samples.slice(0,1);
 if(!selected.length)return res.status(400).json({message:'unknown sample id',allowed:samples.map(x=>x.id)});
 const results=[];for(const item of selected)results.push(await runOne(item,groq,model));
 return res.status(200).json({temporary:true,model,count:results.length,results});
}
module.exports=async function handler(req,res){
 if(req.method==='GET')return smoke(req,res);
 return previewHandler(req,res);
};
