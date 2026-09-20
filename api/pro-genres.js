const {authorizePro}=require('../lib/billing');

function cleanGenre(x){
  if(!x||typeof x!=='object') return null;
  const id=String(x.genreId??x.genreId?.value??'').trim();
  const name=String(x.nameJa??x.genreName??x.name??'').trim();
  const level=Number(x.level??0);
  if(!/^\d+$/.test(id)||!name) return null;
  return {genreId:id,nameJa:name,level:Number.isFinite(level)?level:0};
}
module.exports=async function handler(req,res){
  res.setHeader('Cache-Control','private, max-age=300');
  if(req.method!=='GET') return res.status(405).json({message:'Method not allowed'});
  try{
    const auth=await authorizePro(req);
    if(!auth.ok) return res.status(auth.status||403).json({message:'pro_subscription_required'});
    const genreId=String(req.query?.genreId||'0').trim();
    if(!/^\d+$/.test(genreId)) return res.status(400).json({message:'genreId invalid'});
    const appId=process.env.RAKUTEN_APP_ID,accessKey=process.env.RAKUTEN_ACCESS_KEY;
    if(!appId||!accessKey) throw new Error('Rakuten API settings missing');
    const p=new URLSearchParams({applicationId:appId,accessKey,genreId,format:'json',formatVersion:'2'});
    const r=await fetch('https://openapi.rakuten.co.jp/ichibagt/api/IchibaGenre/Search/20260701?'+p,{
      signal:AbortSignal.timeout(12000),
      headers:{Origin:'https://rakuten-affiliate-ai-mobile.vercel.app',Referer:'https://rakuten-affiliate-ai-mobile.vercel.app/'}
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok) return res.status(r.status).json({message:'楽天ジャンルを取得できませんでした。'});
    const children=(Array.isArray(d.children)?d.children:[]).map(cleanGenre).filter(Boolean);
    const ancestors=(Array.isArray(d.ancestors)?d.ancestors:[]).map(cleanGenre).filter(Boolean);
    const siblings=(Array.isArray(d.siblings)?d.siblings:[]).map(cleanGenre).filter(Boolean);
    const genre=cleanGenre(d.genre);
    return res.status(200).json({genre,ancestors,siblings,children});
  }catch(e){
    console.error('pro genres failed',e?.message||'unknown');
    return res.status(500).json({message:'楽天ジャンルを取得できませんでした。'});
  }
};