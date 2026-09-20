const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,n));
const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
const compact=s=>norm(s).replace(/\s+/g,'');

function relevance(item,keyword){
  const title=norm(item.itemName), tc=compact(item.itemName), q=norm(keyword), qc=compact(keyword);
  if(!title||!q) return 0;
  let score=0;
  const pos=tc.indexOf(qc);
  if(pos===0) score=100; else if(pos>0&&pos<=8) score=96; else if(pos<=20&&pos>8) score=91; else if(pos<=40&&pos>20) score=84; else if(pos>40) score=72;
  const tokens=q.split(' ').filter(Boolean);
  if(tokens.length>1){
    const cov=tokens.filter(t=>title.includes(t)).length/tokens.length;
    if(cov===1) score=Math.max(score,88); else if(cov>=.67) score=Math.max(score,76); else if(cov>=.5) score=Math.max(score,62);
  } else if(pos<0&&title.includes(q)) score=70;
  if(pos>60) score-=8;
  return clamp(Math.round(score));
}
function reviewStrength(x){
  const c=+x.reviewCount||0,a=+x.reviewAverage||0;
  const volume=clamp(Math.log10(c+1)/4*100);
  const confidence=Math.min(1,Math.log10(c+1)/3);
  const rating=clamp(((a-3)/2*100)*(.55+.45*confidence));
  return Math.round(volume*.55+rating*.45);
}
function priceAccessibility(x){
  const p=+x.itemPrice||0;
  if(p<=0)return 0;if(p<1000)return 72;if(p<=3000)return 94;if(p<=10000)return 100;if(p<=30000)return 88;if(p<=50000)return 72;if(p<=100000)return 58;return 42;
}
function preferenceScore(x,sort){
  const c=+x.reviewCount||0,a=+x.reviewAverage||0,r=+x.affiliateRate||0,p=+x.itemPrice||0;
  if(sort==='-reviewCount')return clamp(Math.log10(c+1)/4*100);
  if(sort==='-reviewAverage'){const conf=Math.min(1,Math.log10(c+1)/3);return clamp(((a-3)/2*100)*(.6+.4*conf));}
  if(sort==='-affiliateRate')return clamp(r/10*100);
  if(sort==='+itemPrice')return clamp(100-Math.log10(Math.max(1,p))/6*100);
  return 50;
}
function profitabilityScore(x){
  const rate=+x.affiliateRate||0,price=+x.itemPrice||0,est=Math.min(1000,price*rate/100);
  return Math.round(clamp(rate/10*100)*.20+clamp(est/1000*100)*.80);
}
function saleSignal(x){
  const t=[x.itemName,x.catchcopy,x.itemCaption].filter(Boolean).join(' ');
  return /セール|SALE|クーポン|OFF|ポイント\s*\d+倍|半額|割引|スーパーDEAL/i.test(t) ? 6 : 0;
}
async function searchProducts(settings,{excludeCodes=[]}={}){
  const appId=process.env.RAKUTEN_APP_ID,accessKey=process.env.RAKUTEN_ACCESS_KEY,affiliateId=process.env.RAKUTEN_AFFILIATE_ID;
  if(!appId||!accessKey||!affiliateId) throw new Error('Rakuten API settings are missing');
  const keyword=String(settings.genre||'便利グッズ').trim().slice(0,128);
  const sort=String(settings.sort||'standard');
  const p=new URLSearchParams({applicationId:appId,affiliateId,accessKey,keyword,format:'json',formatVersion:'2',hits:'30',availability:'1',sort:'standard'});
  if(Number.isInteger(settings.min_price)&&settings.min_price>=0)p.set('minPrice',String(settings.min_price));
  if(Number.isInteger(settings.max_price)&&settings.max_price>=0)p.set('maxPrice',String(settings.max_price));
  const r=await fetch('https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701?'+p,{signal:AbortSignal.timeout(12000),headers:{Origin:'https://rakuten-affiliate-ai-mobile.vercel.app',Referer:'https://rakuten-affiliate-ai-mobile.vercel.app/'}});
  if(!r.ok) throw new Error('商品データを取得できませんでした。');
  const data=await r.json().catch(()=>({}));
  const excluded=new Set((excludeCodes||[]).map(String));
  const raw=(Array.isArray(data.items)?data.items:Array.isArray(data.Items)?data.Items:[]).map(v=>v.Item||v)
    .filter(x=>!/ふるさと納税|寄付額|返礼品/.test(String(x.itemName||'')))
    .filter(x=>!excluded.has(String(x.itemCode||'')));
  const ranked=raw.map(x=>{
    const rel=relevance(x,keyword);
    const sell=Math.round(rel*.35+reviewStrength(x)*.30+priceAccessibility(x)*.20+preferenceScore(x,sort)*.15);
    const profit=profitabilityScore(x);
    const bonus=settings.sale_priority?saleSignal(x):0;
    return {...x,relevance:rel,sellability:sell,profitability:profit,score:clamp(Math.round(sell*.70+profit*.30+bonus))};
  }).sort((a,b)=>b.score-a.score||b.sellability-a.sellability||b.relevance-a.relevance);

  return ranked.slice(0,3).map(x=>({
    itemName:String(x.itemName||''),
    itemPrice:+x.itemPrice||0,
    catchcopy:String(x.catchcopy||'').slice(0,500),
    itemCaption:String(x.itemCaption||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,1200),
    genreId:String(x.genreId||''),
    itemCode:String(x.itemCode||''),
    itemUrl:x.itemUrl,
    affiliateUrl:x.affiliateUrl||x.itemUrl,
    reviewCount:+x.reviewCount||0,
    reviewAverage:+x.reviewAverage||0,
    affiliateRate:+x.affiliateRate||0,
    smallImageUrls:x.smallImageUrls||[],
    mediumImageUrls:x.mediumImageUrls||[],
    shopName:x.shopName||'',
    score:x.score,relevance:x.relevance,sellability:x.sellability,profitability:x.profitability,
    estimatedCommission:Math.round(Math.min(1000,(+x.itemPrice||0)*(+x.affiliateRate||0)/100))
  }));
}
module.exports={searchProducts};
