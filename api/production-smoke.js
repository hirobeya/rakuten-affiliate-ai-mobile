'use strict';
const {runTwoStageGroq,defaultCallGroq}=require('./room-ai');
const TOKEN='prod-smoke-generic-20260923';
const ALLOWED=new Set(['収納ボックス','フライパン','ペットベッド','モバイルバッテリー','電動モップ','バイクグローブ']);
async function searchOne(keyword){
  const appId=String(process.env.RAKUTEN_APP_ID||'').trim();
  const accessKey=String(process.env.RAKUTEN_ACCESS_KEY||'').trim();
  const affiliateId=String(process.env.RAKUTEN_AFFILIATE_ID||'').trim();
  if(!appId||!accessKey||!affiliateId) throw new Error('rakuten_env_missing');
  const p=new URLSearchParams({applicationId:appId,accessKey,affiliateId,keyword,format:'json',formatVersion:'2',hits:'1',availability:'1',sort:'standard'});
  const r=await fetch('https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701?'+p,{signal:AbortSignal.timeout(12000),headers:{Origin:'https://rakuten-affiliate-ai-mobile.vercel.app',Referer:'https://rakuten-affiliate-ai-mobile.vercel.app/'}});
  if(!r.ok) throw new Error('rakuten_'+r.status);
  const j=await r.json(); const item=(j.items||j.Items||[])[0]; if(!item) throw new Error('item_not_found'); return item.Item||item;
}
module.exports=async function(req,res){
  res.setHeader('Cache-Control','no-store');
  if(process.env.VERCEL_ENV!=='production'||String(req.query?.token||'')!==TOKEN) return res.status(404).json({message:'Not found'});
  const keyword=String(req.query?.keyword||'').trim();
  if(!ALLOWED.has(keyword)) return res.status(400).json({message:'invalid_keyword'});
  const apiKey=String(process.env.GROQ_API_KEY||'').trim();
  if(!apiKey) return res.status(503).json({ok:false,message:'GROQ_API_KEY is not configured'});
  try{
    const item=await searchOne(keyword);
    const itemName=String(item.itemName||'');
    const itemCaption=String(item.itemCaption||'').slice(0,700);
    const model=String(process.env.GROQ_ROOM_MODEL||'qwen/qwen3.8-27b').trim()||'qwen/qwen3.8-27b';
    const result=await runTwoStageGroq({callAI:defaultCallGroq,apiKey,model,itemName,itemCaption,itemPrice:Number(item.itemPrice)||0,imageUrl:'',allowImage:false});
    return res.status(200).json({ok:true,keyword,itemName,validation:result.validation,raw:result.ai?.raw||null,stages:result.stages});
  }catch(error){return res.status(500).json({ok:false,message:String(error?.message||error)});}
};