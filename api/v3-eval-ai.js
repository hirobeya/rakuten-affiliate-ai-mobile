'use strict';
// Preview-only golden-set evaluator. Never exposed in Production.
const {DEFAULT_MODEL,prepareInput,callGroqOnce,inspectOutput}=require('../lib/room-post-generator-v1');
const golden=require('../tests/fixtures/room-post-golden-50.json');
const {loadImageDataUrl}=require('../lib/room-ai-handler');

function norm(v=''){return String(v??'').normalize('NFKC').replace(/^#+/,'').replace(/\s+/g,'').toLowerCase();}
function groundedHashtags(tags,input,summary=''){
  const source=norm(input?.sourceText||'');const product=norm(summary);const out=[];
  for(const raw of Array.isArray(tags)?tags:[]){
    const body=String(raw||'').replace(/^#+/,'').trim();const n=norm(body);if(!n)continue;
    if(!source.includes(n)&&!(product&&n===product))continue;
    const tag='#'+body.replace(/\s+/g,'');if(!out.includes(tag))out.push(tag);if(out.length>=5)break;
  }
  return out;
}
function hasRealImage(item){
  const u=String(item?.imageUrl||'').trim();
  return /^https:\/\//i.test(u)&&!/^https:\/\/example\.com\//i.test(u);
}
function metadata(item){
  return {id:item.id,category:item.category,pastFailure:!!item.pastFailure,sensitive:!!item.sensitive,numericHeavy:!!item.numericHeavy,variantRisk:!!item.variantRisk,bundle:!!item.bundle,imageOnly:!!item.imageOnly};
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');
  if(process.env.VERCEL_ENV!=='preview')return res.status(404).json({message:'Not found'});
  if(req.method!=='GET')return res.status(405).json({message:'Method not allowed'});
  const id=String(req.query?.id||'').trim();
  if(!id)return res.status(200).json({temporary:true,count:golden.length,ids:golden.map(x=>metadata(x))});
  const item=golden.find(x=>x.id===id);if(!item)return res.status(400).json({message:'unknown golden id'});
  if(item.imageOnly&&!hasRealImage(item))return res.status(422).json({temporary:true,...metadata(item),configurationFailure:true,message:'image-only golden case has no real image URL'});
  const apiKey=String(process.env.GROQ_API_KEY||'').trim();if(!apiKey)return res.status(503).json({message:'GROQ_API_KEY missing'});
  const input=prepareInput(item);const started=Date.now();
  try{
    const model=String(process.env.GROQ_ROOM_MODEL||DEFAULT_MODEL).trim()||DEFAULT_MODEL;
    let imageDataUrl=null;
    if(item.imageOnly&&hasRealImage(item)){
      const image=await loadImageDataUrl(item.imageUrl);
      if(!image?.available)return res.status(422).json({temporary:true,...metadata(item),configurationFailure:true,message:'golden image could not be loaded'});
      imageDataUrl=image.dataUrl;
    }
    const ai=await callGroqOnce({apiKey,model,input,imageDataUrl});
    const inspection=inspectOutput(ai.raw,input);
    const final={...inspection.final,hashtags:groundedHashtags(inspection.final.hashtags,input,inspection.final.product_summary)};
    return res.status(200).json({temporary:true,...metadata(item),model,elapsedMs:Date.now()-started,usedImage:Boolean(imageDataUrl),input:{itemName:input.itemName,description:input.description},raw:ai.raw,removedSentenceCount:inspection.removedSentenceCount,final});
  }catch(error){return res.status(error?.status||502).json({temporary:true,...metadata(item),error:String(error?.message||'failed'),status:error?.status||null,elapsedMs:Date.now()-started});}
};
