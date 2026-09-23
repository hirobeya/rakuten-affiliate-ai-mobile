'use strict';
const {runTwoStageGroq,defaultCallGroq}=require('./room-ai');

const TOKEN='prod-groq-check-20260924-0755-f8c1';
const EXPIRES_AT=Date.parse('2026-09-23T23:20:00Z');

module.exports=async function(req,res){
  res.setHeader('Cache-Control','no-store');
  if(
    process.env.VERCEL_ENV!=='production' ||
    Date.now()>EXPIRES_AT ||
    String(req.query?.token||'')!==TOKEN
  ) return res.status(404).json({message:'Not found'});

  const keyword='バイクグローブ';
  const apiKey=String(process.env.GROQ_API_KEY||'').trim();
  if(!apiKey) return res.status(503).json({ok:false,groqConfigured:false,message:'GROQ_API_KEY is not configured'});

  try{
    const p=new URLSearchParams({
      applicationId:String(process.env.RAKUTEN_APP_ID||''),
      accessKey:String(process.env.RAKUTEN_ACCESS_KEY||''),
      affiliateId:String(process.env.RAKUTEN_AFFILIATE_ID||''),
      keyword,
      format:'json',
      formatVersion:'2',
      hits:'1',
      availability:'1',
      sort:'standard'
    });
    const rr=await fetch('https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701?'+p.toString(),{
      signal:AbortSignal.timeout(12000),
      headers:{Origin:'https://rakuten-affiliate-ai-mobile.vercel.app',Referer:'https://rakuten-affiliate-ai-mobile.vercel.app/'}
    });
    if(!rr.ok) return res.status(rr.status).json({ok:false,groqConfigured:true,stage:'rakuten',status:rr.status});
    const data=await rr.json();
    const item=(data.items||data.Items||[])[0]?.Item||(data.items||data.Items||[])[0];
    if(!item) return res.status(404).json({ok:false,groqConfigured:true,stage:'item'});

    const result=await runTwoStageGroq({
      callAI:defaultCallGroq,
      apiKey,
      model:String(process.env.GROQ_ROOM_MODEL||'qwen/qwen3.8-27b'),
      itemName:String(item.itemName||''),
      itemCaption:String(item.itemCaption||'').slice(0,1200),
      itemPrice:Number(item.itemPrice)||0,
      imageUrl:'',
      allowImage:false
    });

    return res.status(200).json({
      ok:true,
      groqConfigured:true,
      keyword,
      itemName:String(item.itemName||''),
      validation:result.validation,
      stages:result.stages,
      model:result.ai?.model||null
    });
  }catch(error){
    return res.status(500).json({
      ok:false,
      groqConfigured:true,
      message:String(error?.message||error),
      status:error?.status||null
    });
  }
};