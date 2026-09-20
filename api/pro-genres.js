const {authorizePro,db}=require('../lib/billing');

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
    const cachedRows=await db('urenavi_rakuten_genre_cache?'+new URLSearchParams({genre_id:'eq.'+genreId,select:'payload,fetched_at'}));
    const cached=cachedRows?.[0]||null;
    const fresh=cached && (Date.now()-new Date(cached.fetched_at).getTime()) < 24*60*60*1000;
    if(fresh) return res.status(200).json({...cached.payload,cached:true});

    const appId=process.env.RAKUTEN_APP_ID,accessKey=process.env.RAKUTEN_ACCESS_KEY;
    if(!appId||!accessKey) throw new Error('Rakuten API settings missing');
    const p=new URLSearchParams({applicationId:appId,accessKey,genreId,format:'json',formatVersion:'2'});
    const r=await fetch('https://openapi.rakuten.co.jp/ichibagt/api/IchibaGenre/Search/20260701?'+p,{
      signal:AbortSignal.timeout(12000),
      headers:{Origin:'https://rakuten-affiliate-ai-mobile.vercel.app',Referer:'https://rakuten-affiliate-ai-mobile.vercel.app/'}
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok){
      if(cached) return res.status(200).json({...cached.payload,cached:true,stale:true});
      return res.status(r.status).json({message:r.status===429?'楽天側が混み合っています。少し待って再試行してください。':'楽天ジャンルを取得できませんでした。'});
    }
    const payload={
      children:(Array.isArray(d.children)?d.children:[]).map(cleanGenre).filter(Boolean),
      ancestors:(Array.isArray(d.ancestors)?d.ancestors:[]).map(cleanGenre).filter(Boolean),
      siblings:(Array.isArray(d.siblings)?d.siblings:[]).map(cleanGenre).filter(Boolean),
      genre:cleanGenre(d.genre)
    };
    await db('urenavi_rakuten_genre_cache?on_conflict=genre_id',{
      method:'POST',
      headers:{Prefer:'resolution=merge-duplicates,return=minimal'},
      body:JSON.stringify({genre_id:genreId,payload,fetched_at:new Date().toISOString()})
    });
    return res.status(200).json({...payload,cached:false});
  }catch(e){
    console.error('pro genres failed',e?.message||'unknown');
    return res.status(500).json({message:'楽天ジャンルを取得できませんでした。'});
  }
};