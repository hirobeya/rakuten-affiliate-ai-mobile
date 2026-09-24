'use strict';

const report=require('../tests/reports/rakuten-neutral-copy-report-20260925.json');
const roomAi=require('./room-ai');
const TOKEN='step3-groq100-60543-20260925';

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(process.env.VERCEL_ENV!=='preview') return res.status(404).json({message:'not found'});
  if(req.method!=='GET') return res.status(405).json({message:'Method not allowed'});
  if(String(req.query?.token||'')!==TOKEN) return res.status(404).json({message:'not found'});
  const n=Number(req.query?.case||0);
  if(!Number.isInteger(n)||n<1||n>100) return res.status(400).json({message:'case must be 1..100'});
  const row=report.sample100[n-1];
  if(!row?.itemName) return res.status(404).json({message:'fixture missing'});
  const apiKey=String(process.env.GROQ_API_KEY||'').trim();
  if(!apiKey) return res.status(503).json({message:'GROQ_API_KEY is not configured'});
  try{
    const model=String(process.env.GROQ_ROOM_MODEL||'qwen/qwen3.8-27b').trim()||'qwen/qwen3.8-27b';
    const result=await roomAi.runTwoStageGroq({
      callAI:roomAi.defaultCallGroq,
      apiKey,
      model,
      itemName:String(row.itemName||''),
      itemCaption:'',
      itemPrice:Number(row.itemPrice)||0,
      imageUrl:'',
      imageLoader:async()=>({available:false,dataUrl:null}),
      allowImage:false
    });
    const v=result.validation||{};
    const pick=arr=>(Array.isArray(arr)?arr:[]).map(x=>({
      text:String(x?.text||x?.value||''),
      evidence:String(x?.evidence||''),
      source:String(x?.source||''),
      valid:Boolean(x?.valid),
      specLike:Boolean(x?.specLike),
      eligibleForPost:Boolean(x?.eligibleForPost)
    }));
    return res.status(200).json({
      case:n,genre:row.genre,itemName:row.itemName,itemPrice:row.itemPrice,
      model:result.ai?.model||model,mode:v.mode,confidence:v.confidence,reasons:v.reasons||[],
      productType:v.productType||null,
      features:pick(v.features),
      sellingPoints:pick(v.sellingPoints),
      eligibleFeatures:pick(v.features).filter(x=>x.eligibleForPost),
      eligibleSellingPoints:pick(v.sellingPoints).filter(x=>x.eligibleForPost)
    });
  }catch(e){
    return res.status(502).json({case:n,message:String(e?.message||'AI analysis failed'),status:e?.status||null,rateLimit:e?.rateLimit||{}});
  }
};