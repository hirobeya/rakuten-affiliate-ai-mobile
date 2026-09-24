'use strict';

const TOKEN='fixture-harvest-20260925';
const GENRE_URL='https://openapi.rakuten.co.jp/ichibagt/api/IchibaGenre/Search/20260701';
const ITEM_URL='https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701';
const RAKUTEN_HEADERS={Origin:'https://rakuten-affiliate-ai-mobile.vercel.app',Referer:'https://rakuten-affiliate-ai-mobile.vercel.app/'};

function cleanGenre(x){
  const id=String(x?.genreId??'').trim();
  const name=String(x?.nameJa??x?.genreName??'').trim();
  return /^\d+$/.test(id)&&name?{genreId:id,nameJa:name}:null;
}
function cleanItems(d,fallbackGenre=''){
  const raw=Array.isArray(d?.items)?d.items:Array.isArray(d?.Items)?d.Items:[];
  return raw.map(v=>v?.Item||v).map(x=>({
    itemName:String(x?.itemName||'').trim(),
    itemPrice:Number(x?.itemPrice)||0,
    genreId:String(x?.genreId||fallbackGenre),
    itemCode:String(x?.itemCode||'')
  })).filter(x=>x.itemName).slice(0,25);
}
async function getJson(url,timeoutMs){
  const r=await fetch(url,{signal:AbortSignal.timeout(timeoutMs),headers:RAKUTEN_HEADERS});
  const d=await r.json().catch(()=>({}));
  return {r,d};
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
    if(mode==='root'||mode==='children'){
      const genreId=mode==='root'?'0':String(req.query?.genreId||'').trim();
      if(!/^\d+$/.test(genreId)) return res.status(400).json({message:'genreId invalid'});
      const p=new URLSearchParams({applicationId,accessKey,genreId,format:'json',formatVersion:'2'});
      const {r,d}=await getJson(GENRE_URL+'?'+p,12000);
      if(!r.ok) return res.status(r.status).json({message:'genre fetch failed',status:r.status});
      const children=(Array.isArray(d.children)?d.children:[]).map(cleanGenre).filter(Boolean);
      return res.status(200).json(mode==='root'?{genres:children}:{genreId,children});
    }
    if(mode==='genre'){
      const genreId=String(req.query?.genreId||'').trim();
      if(!/^\d+$/.test(genreId)) return res.status(400).json({message:'genreId invalid'});
      const p=new URLSearchParams({applicationId,accessKey,genreId,format:'json',formatVersion:'2',hits:'30',availability:'1',sort:'standard'});
      const {r,d}=await getJson(ITEM_URL+'?'+p,15000);
      if(!r.ok) return res.status(r.status).json({message:'item fetch failed',status:r.status});
      return res.status(200).json({genreId,items:cleanItems(d,genreId)});
    }
    if(mode==='keyword'){
      const keyword=String(req.query?.keyword||'').trim().slice(0,80);
      if(!keyword) return res.status(400).json({message:'keyword required'});
      const p=new URLSearchParams({applicationId,accessKey,keyword,format:'json',formatVersion:'2',hits:'30',availability:'1',sort:'standard'});
      const {r,d}=await getJson(ITEM_URL+'?'+p,15000);
      if(!r.ok) return res.status(r.status).json({message:'item fetch failed',status:r.status});
      return res.status(200).json({keyword,items:cleanItems(d,'')});
    }
    return res.status(400).json({message:'mode invalid'});
  }catch(e){
    return res.status(500).json({message:String(e?.message||'harvest failed')});
  }
};