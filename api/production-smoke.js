'use strict';
const {runTwoStageGroq,defaultCallGroq}=require('./room-ai');
const {validateAiExtraction}=require('../lib/room-ai');
const TOKEN='prod-smoke-20260923-urenavi-final';
const ALLOWED=new Set(['バイクグローブ','野球グローブ','収納ベンチ','電動モップ']);
async function searchOne(keyword){
  const appId=String(process.env.RAKUTEN_APP_ID||'').trim();
  const affiliateId=String(process.env.RAKUTEN_AFFILIATE_ID||'').trim();
  if(!appId||!affiliateId) throw new Error('rakuten_env_missing');
  const p=new URLSearchParams({applicationId:appId,affiliateId,keyword,format:'json',formatVersion:'2',hits:'1',availability:'1',sort:'standard'});
  const r=await fetch('https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601?'+p,{signal:AbortSignal.timeout(12000)});
  if(!r.ok) throw new Error('rakuten_'+r.status);
  const j=await r.json();
  const item=(j.Items||[])[0];
  if(!item) throw new Error('item_not_found');
  return item.Item||item;
}
module.exports=async function(req,res){
  res.setHeader('Cache-Control','no-store');
  if(process.env.VERCEL_ENV!=='production'||String(req.query?.token||'')!==TOKEN) return res.status(404).json({message:'Not found'});
  const keyword=String(req.query?.keyword||'').trim();
  if(!ALLOWED.has(keyword)) return res.status(400).json({message:'invalid_keyword'});
  const apiKey=String(process.env.GROQ_API_KEY||'').trim();
  if(!apiKey) return res.status(503).json({ok:false,groqConfigured:false,message:'GROQ_API_KEY is not configured'});
  try{
    const item=await searchOne(keyword);
    const itemName=String(item.itemName||'');
    const itemCaption=String(item.itemCaption||'').slice(0,700);
    const model=String(process.env.GROQ_ROOM_MODEL||'qwen/qwen3.8-27b').trim()||'qwen/qwen3.8-27b';
    const result=await runTwoStageGroq({callAI:defaultCallGroq,apiKey,model,itemName,itemCaption,itemPrice:Number(item.itemPrice)||0,imageUrl:'',allowImage:false});
    return res.status(200).json({
      ok:true,groqConfigured:true,keyword,
      item:{itemName,itemCaption:itemCaption.slice(0,300)},
      model:result.ai?.model||model,
      validation:result.validation,
      stages:result.stages
    });
  }catch(error){
    return res.status(500).json({ok:false,groqConfigured:true,message:String(error?.message||error)});
  }
};