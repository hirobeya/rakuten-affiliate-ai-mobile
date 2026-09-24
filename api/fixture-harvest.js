'use strict';

const TOKEN='fixture-harvest-20260925';
const GENRE_URL='https://openapi.rakuten.co.jp/ichibagt/api/IchibaGenre/Search/20260701';
const ITEM_URL='https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';

function cleanGenre(x){
  const id=String(x?.genreId??'').trim();
  const name=String(x?.nameJa??x?.genreName??'').trim();
  return /^\d+$/.test(id)&&name?{genreId:id,nameJa:name}:null;
}

module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(process.env.VERCEL_ENV!=='preview') return res.status(404).json({message:'not found'});
  if(req.query?.token!==TOKEN) return res.status(404).json({message:'not found'});
  if(req.method!=='GET') return res.status(405).json({message:'Method not allowed'});
  const applicationId=process.env.RAKUTEN_APP_ID;
  const accessKey=process.env.RAKUTEN_ACCESS_KEY;
  if(!applicationId||!accessKey) return res.status(500).json({message:'Rakuten API settings missing'});
  const mode=String(req.query?.mode||'root');
  try{
    if(mode==='root'){
      const p=new URLSearchParams({applicationId,accessKey,genreId:'0',format:'json',formatVersion:'2'});
      const r=await fetch(GENRE_URL+'?'+p,{signal:AbortSignal.timeout(12000),headers:{Origin:'https://rakuten-affiliate-ai-mobile.vercel.app',Referer:'https://rakuten-affiliate-ai-mobile.vercel.app/'}});
      const d=await r.json().catch(()=>({}));
      if(!r.ok) return res.status(r.status).json({message:'genre fetch failed',status:r.status});
      return res.status(200).json({genres:(Array.isArray(d.children)?d.children:[]).map(cleanGenre).filter(Boolean)});
    }
    if(mode==='genre'){
      const genreId=String(req.query?.genreId||'').trim();
      if(!/^\d+$/.test(genreId)) return res.status(400).json({message:'genreId invalid'});
      const p=new URLSearchParams({
        applicationId,accessKey,genreId,format:'json',formatVersion:'2',
        hits:'30',availability:'1',sort:'standard'
      });
      const r=await fetch(ITEM_URL+'?'+p,{signal:AbortSignal.timeout(15000),headers:{Origin:'https://rakuten-affiliate-ai-mobile.vercel.app',Referer:'https://rakuten-affiliate-ai-mobile.vercel.app/'}});
      const d=await r.json().catch(()=>({}));
      if(!r.ok) return res.status(r.status).json({message:'item fetch failed',status:r.status});
      const raw=Array.isArray(d.items)?d.items:Array.isArray(d.Items)?d.Items:[];
      const items=raw.map(v=>v?.Item||v).map(x=>({
        itemName:String(x?.itemName||'').trim(),
        itemPrice:Number(x?.itemPrice)||0,
        genreId:String(x?.genreId||genreId),
        itemCode:String(x?.itemCode||'')
      })).filter(x=>x.itemName).slice(0,25);
      return res.status(200).json({genreId,items});
    }
    return res.status(400).json({message:'mode invalid'});
  }catch(e){
    return res.status(500).json({message:String(e?.message||'harvest failed')});
  }
};