'use strict';
const {runTwoStageGroq,defaultCallGroq}=require('./room-ai');
module.exports=async function(req,res){
  res.setHeader('Cache-Control','no-store');
  if(process.env.VERCEL_ENV!=='preview'||String(req.query?.token||'')!=='sales-copy-final-check') return res.status(404).json({message:'Not found'});
  const keyword='バイクグローブ';
  try{
    const p=new URLSearchParams({
      applicationId:String(process.env.RAKUTEN_APP_ID||''),
      accessKey:String(process.env.RAKUTEN_ACCESS_KEY||''),
      affiliateId:String(process.env.RAKUTEN_AFFILIATE_ID||''),
      keyword,format:'json',formatVersion:'2',hits:'1',availability:'1',sort:'standard'
    });
    const rr=await fetch('https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701?'+p.toString(),{
      signal:AbortSignal.timeout(12000),
      headers:{Origin:'https://rakuten-affiliate-ai-mobile.vercel.app',Referer:'https://rakuten-affiliate-ai-mobile.vercel.app/'}
    });
    if(!rr.ok) return res.status(rr.status).json({ok:false,stage:'rakuten'});
    const data=await rr.json();
    const item=(data.items||data.Items||[])[0]?.Item||(data.items||data.Items||[])[0];
    if(!item) return res.status(404).json({ok:false,stage:'item'});
    const result=await runTwoStageGroq({
      callAI:defaultCallGroq,
      apiKey:String(process.env.GROQ_API_KEY||''),
      model:String(process.env.GROQ_ROOM_MODEL||'qwen/qwen3.8-27b'),
      itemName:String(item.itemName||''),
      itemCaption:String(item.itemCaption||'').slice(0,1200),
      itemPrice:Number(item.itemPrice)||0,
      imageUrl:'',
      allowImage:false
    });
    const v=result.validation||{};
    const features=(v.features||[]).filter(x=>x?.eligibleForPost&&x?.text&&x?.evidence).map(x=>String(x.text).trim()).slice(0,4);
    const points=(v.sellingPoints||[]).filter(x=>x?.eligibleForPost&&x?.text&&x?.evidence).map(x=>String(x.text).trim()).slice(0,2);
    const productType=(v.productType?.valid&&v.productType?.value)?String(v.productType.value):'';
    const core=x=>String(x||'').normalize('NFKC').replace(/[「」『』"'。、，,.・/／\\\s]/g,'').toLowerCase();
    const lines=[];
    if((v.mode==='simple'||v.mode==='simple_partial')&&productType){
      if(features.length>=2) lines.push(features[0]+'と'+features[1]+'を重視して、'+productType+'を選びたい方へ。');
      else if(features.length===1) lines.push(features[0]+'をチェックして、'+productType+'を選びたい方へ。');
      else if(points.length) lines.push(productType+'選びで、商品ページの違いをきちんと比べたい方へ。');
      if(points.length) lines.push('',...points);
      const extras=features.filter(f=>{const fc=core(f);return fc&&!points.some(p=>{const pc=core(p);return pc.includes(fc)||fc.includes(pc);});}).slice(0,3);
      if(extras.length) lines.push('','さらに、'+extras.join('・')+'も商品ページで確認できます。');
      if(Number(item.itemPrice)>0) lines.push('','価格：'+new Intl.NumberFormat('ja-JP').format(Number(item.itemPrice))+'円');
      lines.push('','※アフィリエイト広告を利用しています');
    }
    return res.status(200).json({ok:true,itemName:item.itemName,itemPrice:item.itemPrice,validation:v,post:lines.join('\n').slice(0,500)});
  }catch(e){return res.status(500).json({ok:false,message:String(e?.message||e)});}
};