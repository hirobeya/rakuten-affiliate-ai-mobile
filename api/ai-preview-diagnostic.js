'use strict';
const {createHandler:createSearchHandler}=require('./search');
const {runTwoStageGroq,defaultCallGroq,loadImageDataUrl}=require('./room-ai');

const TOKEN='preview-rate-retest-20260922-49e7d2';
const CASES={
  'baseball-glove':'野球グローブ',
  'bike-glove':'バイクグローブ',
  'storage-bench':'収納ベンチ',
  'face-roller':'美顔ローラー',
  'lint-roller':'粘着ローラー'
};
function fakeRes(){return {statusCode:200,body:null,setHeader(){},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}};}
async function searchItems(keyword){
  const h=createSearchHandler({authorize:async()=>({ok:true,plan:'owner'})});
  const res=fakeRes();
  await h({method:'GET',query:{keyword,sort:'standard'},headers:{}},res);
  if(res.statusCode!==200) throw new Error('search_failed_'+res.statusCode);
  return (res.body?.items||[]).slice(0,10);
}
async function analyze(item){
  const itemName=String(item?.itemName||'');
  const itemCaption=String(item?.itemCaption||'');
  const imageUrl=String([...(item?.mediumImageUrls||[]),...(item?.smallImageUrls||[])].find(Boolean)||'');
  const model=String(process.env.GROQ_ROOM_MODEL||'qwen/qwen3.8-27b').trim()||'qwen/qwen3.8-27b';
  const started=Date.now();
  try{
    const result=await runTwoStageGroq({
      callAI:defaultCallGroq,
      apiKey:String(process.env.GROQ_API_KEY||''),
      model,itemName,itemCaption,itemPrice:Number(item?.itemPrice)||0,imageUrl,
      imageLoader:loadImageDataUrl
    });
    return {
      itemCode:String(item?.itemCode||''),itemName,
      model:result.ai?.model||model,elapsedMs:Date.now()-started,
      stages:result.stages,rateLimit:result.ai?.rateLimit||{},attempts:result.ai?.attempts||1,
      rawAiJson:result.ai?.raw||null,validation:result.validation
    };
  }catch(error){
    return {
      itemCode:String(item?.itemCode||''),itemName,elapsedMs:Date.now()-started,
      error:{message:String(error?.message||'ai_failed'),status:error?.status||null,detail:error?.safeError||null},
      rateLimit:error?.rateLimit||{}
    };
  }
}
module.exports=async function(req,res){
  res.setHeader('Cache-Control','no-store');
  if(process.env.VERCEL_ENV!=='preview'||Date.now()>Date.parse('2026-09-22T15:30:00Z')||String(req.query?.token||'')!==TOKEN) return res.status(404).json({message:'Not found'});
  const keyword=CASES[String(req.query?.case||'')];
  if(!keyword) return res.status(400).json({message:'invalid_case'});
  const index=Math.max(0,Math.min(9,Number(req.query?.index)||0));
  const t0=Date.now();
  const items=await searchItems(keyword);
  const searchMs=Date.now()-t0;
  const item=items[index];
  if(!item) return res.status(404).json({message:'item_not_found',keyword,index,count:items.length});
  const result=await analyze(item);
  return res.status(200).json({
    ok:true,keyword,index,count:items.length,provider:'groq',searchMs,totalMs:Date.now()-t0,result
  });
};