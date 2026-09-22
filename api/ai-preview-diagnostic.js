'use strict';
global.window=global.window||{};
require('../public/pain-copy.js');
require('../public/room-copy-quality.js');
const ruleApi=global.window.UrenaviPainCopy;
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
const TARGET_KEYWORDS=[
  '野球グローブ','バイクグローブ','収納ベンチ','収納ボックス',
  'モバイルバッテリー','ポータブル電源',
  'ペットベッド','犬 ベッド','ペット給水器',
  'モップハンガー','電動モップ','ハンディクリーナー','洗濯ネット'
];

function aiTargetDecision(item){
  const a=ruleApi.analyzeRoomProduct(item,'');
  const top=Array.isArray(a?.topCandidates)?a.topCandidates:[];
  const conflicts=Array.isArray(a?.conflicts)?a.conflicts:[];
  if(a?.outputMode!=='full') return {target:true,reason:'rule_fallback',analysis:a};
  if(a?.ambiguous) return {target:true,reason:'rule_ambiguous',analysis:a};
  if(conflicts.length) return {target:true,reason:'rule_conflict',analysis:a};
  if(top.length>=2){
    const gap=Number(top[0]?.score||0)-Number(top[1]?.score||0);
    if(gap<20) return {target:true,reason:'small_candidate_gap',gap,analysis:a};
  }
  if(top.length===1 && Number(top[0]?.score||0)<80) return {target:true,reason:'weak_single_candidate',analysis:a};
  return {target:false,reason:'rule_confident',analysis:a};
}

async function targetingDistribution(){
  const rows=[];
  for(const keyword of TARGET_KEYWORDS){
    const t0=Date.now();
    const items=await searchItems(keyword);
    const decisions=items.map((item,index)=>{
      const d=aiTargetDecision(item);
      return {
        index,itemCode:String(item?.itemCode||''),itemName:String(item?.itemName||''),
        target:d.target,reason:d.reason,
        outputMode:d.analysis?.outputMode||null,ambiguous:Boolean(d.analysis?.ambiguous),
        conflicts:(d.analysis?.conflicts||[]).map(x=>x.usage||x.category||String(x)),
        topCandidates:d.analysis?.topCandidates||[]
      };
    });
    rows.push({keyword,count:items.length,targetCount:decisions.filter(x=>x.target).length,searchMs:Date.now()-t0,decisions});
  }
  const counts=rows.map(x=>x.targetCount);
  return {
    searches:rows.length,totalItems:rows.reduce((s,x)=>s+x.count,0),
    average:Number((counts.reduce((a,b)=>a+b,0)/Math.max(1,counts.length)).toFixed(2)),
    min:Math.min(...counts),max:Math.max(...counts),rows
  };
}
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
      usage:result.ai?.usage||null,outputTokens:Number(result.ai?.usage?.output_tokens||result.ai?.usage?.output_tokens_details?.total_tokens||0)||null,
      rawAiJson:result.ai?.raw||null,validation:result.validation
    };
  }catch(error){
    return {
      itemCode:String(item?.itemCode||''),itemName,elapsedMs:Date.now()-started,
      error:{message:String(error?.message||'ai_failed'),status:error?.status||null,detail:error?.safeError||null,final429:error?.status===429},
      rateLimit:error?.rateLimit||{}
    };
  }
}
module.exports=async function(req,res){
  res.setHeader('Cache-Control','no-store');
  if(process.env.VERCEL_ENV!=='preview'||Date.now()>Date.parse('2026-09-23T15:30:00Z')||String(req.query?.token||'')!==TOKEN) return res.status(404).json({message:'Not found'});
  if(String(req.query?.mode||'')==='targeting'){
    const t0=Date.now();
    const distribution=await targetingDistribution();
    return res.status(200).json({ok:true,mode:'targeting',totalMs:Date.now()-t0,distribution});
  }
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