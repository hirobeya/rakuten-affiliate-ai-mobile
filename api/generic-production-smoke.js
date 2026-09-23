'use strict';
const {runTwoStageGroq,defaultCallGroq}=require('./room-ai');
const TOKEN='generic-prod-smoke-20260923-final';
const KEYWORDS=new Set([
  '収納ボックス','電動モップ','ペットベッド','電気ケトル','フライパン',
  'USB-C ハブ','車用スマホホルダー','レトルトカレー','Tシャツ','ティッシュペーパー',
  'バイクグローブ','野球グローブ'
]);
function cleanTitle(value=''){
  return String(value||'').normalize('NFKC').replace(/【[^】]*】|\[[^\]]*\]|★|＼|／/g,' ').replace(/\s+/g,' ').trim().slice(0,80);
}
async function searchOne(keyword){
  const appId=String(process.env.RAKUTEN_APP_ID||'').trim();
  const accessKey=String(process.env.RAKUTEN_ACCESS_KEY||'').trim();
  const affiliateId=String(process.env.RAKUTEN_AFFILIATE_ID||'').trim();
  if(!appId||!accessKey||!affiliateId) throw new Error('rakuten_env_missing');
  const p=new URLSearchParams({applicationId:appId,accessKey,affiliateId,keyword,format:'json',formatVersion:'2',hits:'1',availability:'1',sort:'standard'});
  const r=await fetch('https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701?'+p,{
    signal:AbortSignal.timeout(12000),
    headers:{Origin:'https://rakuten-affiliate-ai-mobile.vercel.app',Referer:'https://rakuten-affiliate-ai-mobile.vercel.app/'}
  });
  if(!r.ok) throw new Error('rakuten_'+r.status);
  const j=await r.json();
  const item=(j.items||j.Items||[])[0];
  if(!item) throw new Error('item_not_found');
  return item.Item||item;
}
function postPreview(item,validation){
  const price=Number(item?.itemPrice);
  const priceLine=Number.isFinite(price)&&price>0?'価格：'+new Intl.NumberFormat('ja-JP').format(price)+'円':'';
  const features=(validation?.features||[]).filter(x=>x?.eligibleForPost&&x?.text).map(x=>String(x.text).trim()).filter((x,i,a)=>x&&a.indexOf(x)===i).slice(0,4);
  const points=(validation?.sellingPoints||[]).filter(x=>x?.eligibleForPost&&x?.text).map(x=>String(x.text).trim()).filter((x,i,a)=>x&&a.indexOf(x)===i).slice(0,2);
  const lines=[];
  if((validation?.mode==='simple'||validation?.mode==='simple_partial')&&validation?.productType?.valid){
    lines.push(String(validation.productType.value)+'を探している方へ。');
    if(points.length) lines.push(...points.map(x=>'・'+x));
    else if(features.length) lines.push('・'+features.slice(0,2).join(' / '));
    if(features.length) lines.push('','商品の特徴👇',...features.map(x=>'✔ '+x));
  }else{
    lines.push(cleanTitle(item?.itemName)||'商品');
    if(points.length) lines.push('',...points.map(x=>'・'+x));
    if(features.length) lines.push('','商品ページで確認できるポイント👇',...features.map(x=>'✔ '+x));
  }
  if(priceLine) lines.push('',priceLine);
  lines.push('','※アフィリエイト広告を利用しています');
  return lines.join('\n').slice(0,500);
}
module.exports=async function(req,res){
  res.setHeader('Cache-Control','no-store');
  if(process.env.VERCEL_ENV!=='production'||String(req.query?.token||'')!==TOKEN) return res.status(404).json({message:'Not found'});
  const keyword=String(req.query?.keyword||'').trim();
  if(!KEYWORDS.has(keyword)) return res.status(400).json({message:'invalid_keyword'});
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
      item:{itemName,itemPrice:Number(item.itemPrice)||0},
      model:result.ai?.model||model,
      validation:result.validation,
      postPreview:postPreview(item,result.validation),
      stages:result.stages,
      rateLimit:result.ai?.rateLimit||{}
    });
  }catch(error){
    return res.status(500).json({ok:false,groqConfigured:true,keyword,message:String(error?.message||error)});
  }
};