'use strict';

const {createHandler:createSearchHandler}=require('./search');
const {defaultCallGroq,loadImageDataUrl}=require('./room-ai');
const {preprocessCaption,validateAiExtraction}=require('../lib/room-ai');
const {db}=require('../lib/billing');

const TOKEN='preview-ai-gate-20260922-7f3a91c2';
const CASES={
  'baseball-glove':{keyword:'野球グローブ',limit:10},
  'bike-glove':{keyword:'バイクグローブ',limit:10},
  'storage-bench':{keyword:'収納ベンチ',limit:1},
  'drive-bed':{keyword:'車用ドライブベッド',limit:1},
  'aircon-battery':{keyword:'空調服用バッテリー',limit:1},
  'mop-holder':{keyword:'モップハンガー',limit:1},
  'face-roller':{keyword:'美顔ローラー',limit:1},
  'water-peeling':{keyword:'ウォーターピーリング',limit:1},
  'kassa':{keyword:'かっさ',limit:1},
  'lint-roller':{keyword:'粘着ローラー',limit:1}
};

function firstImageUrl(item){
  const list=[...(item?.mediumImageUrls||[]),...(item?.smallImageUrls||[])];
  const x=list.find(Boolean);
  return typeof x==='string'?x:String(x?.imageUrl||'');
}
function fakeRes(){
  return {statusCode:200,body:null,setHeader(){},status(n){this.statusCode=n;return this;},json(v){this.body=v;return this;}};
}
async function searchItems(keyword){
  const h=createSearchHandler({authorize:async()=>({ok:true,plan:'owner'})});
  const res=fakeRes();
  await h({method:'GET',query:{keyword,sort:'standard'},headers:{}},res);
  if(res.statusCode!==200) throw new Error('search_failed_'+res.statusCode);
  return Array.isArray(res.body?.items)?res.body.items:[];
}
async function consume(){
  const r=await db('rpc/urenavi_consume_ai_daily_limit',{method:'POST',body:JSON.stringify({p_limit:200})});
  if(!(r===true||r?.allowed===true)) throw new Error('AI daily limit reached');
}
async function analyzeOne(item){
  await consume();
  const itemName=String(item?.itemName||'');
  const itemCaption=preprocessCaption(String(item?.itemCaption||''));
  const imageUrl=firstImageUrl(item);
  const image=await loadImageDataUrl(imageUrl);
  const model=String(process.env.GROQ_ROOM_MODEL||'qwen/qwen3.8-27b').trim()||'qwen/qwen3.8-27b';
  const started=Date.now();
  const ai=await defaultCallGroq({
    apiKey:String(process.env.GROQ_API_KEY||'').trim(),
    model,itemName,itemCaption,itemPrice:Number(item?.itemPrice)||0,
    imageDataUrl:image.dataUrl
  });
  const elapsedMs=Date.now()-started;
  const validation=validateAiExtraction(ai.raw,{itemName,itemCaption},{imageAvailable:image.available});
  return {
    itemCode:String(item?.itemCode||''),
    itemName,
    itemPrice:Number(item?.itemPrice)||0,
    imageUrl,
    model:ai.model||model,
    elapsedMs,
    rawAiJson:ai.raw,
    validation
  };
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(process.env.VERCEL_ENV!=='preview') return res.status(404).json({message:'Not found'});
  if(req.method!=='GET') return res.status(405).json({message:'Method not allowed'});
  if(String(req.query?.token||'')!==TOKEN) return res.status(404).json({message:'Not found'});
  const key=String(req.query?.case||'');
  const spec=CASES[key];
  if(!spec) return res.status(400).json({message:'invalid_case',allowed:Object.keys(CASES)});
  if(!process.env.GROQ_API_KEY) return res.status(503).json({message:'GROQ_API_KEY missing'});
  try{
    const t0=Date.now();
    const items=(await searchItems(spec.keyword)).slice(0,spec.limit);
    const searchMs=Date.now()-t0;
    const out=new Array(items.length);
    let cursor=0;
    const worker=async()=>{
      while(cursor<items.length){
        const i=cursor++;
        out[i]=await analyzeOne(items[i]);
      }
    };
    const aiStarted=Date.now();
    await Promise.all(Array.from({length:Math.min(3,items.length)},()=>worker()));
    const aiBatchMs=Date.now()-aiStarted;
    return res.status(200).json({
      ok:true,case:key,keyword:spec.keyword,count:items.length,
      provider:'groq',expectedModel:'qwen/qwen3.8-27b',
      searchMs,aiBatchMs,totalMs:Date.now()-t0,
      items:out
    });
  }catch(error){
    return res.status(500).json({message:String(error?.message||'diagnostic_failed')});
  }
};