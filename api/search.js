const SUPABASE_URL='https://upooxcugrplfmjnqpuxs.supabase.co';
const SUPABASE_KEY='sb_publishable_OBQUoiuGzy_YagoMeAnHYg_BTNfn8j5';
const REAUTH_MS=30*24*60*60*1000;

const clamp=(n,min=0,max=100)=>Math.max(min,Math.min(max,n));
const norm=s=>String(s||'').normalize('NFKC').toLowerCase().replace(/\s+/g,' ').trim();
const compact=s=>norm(s).replace(/\s+/g,'');

async function verifyUser(req){
  const authorization=String(req.headers.authorization||'');

  if(!authorization.startsWith('Bearer ')){
    return {ok:false,message:'Authentication required'};
  }

  const token=authorization.slice(7).trim();

  if(!token){
    return {ok:false,message:'Authentication required'};
  }

  const r=await fetch(`${SUPABASE_URL}/auth/v1/user`,{
    headers:{
      Authorization:`Bearer ${token}`,
      apikey:SUPABASE_KEY
    }
  });

  if(!r.ok){
    return {ok:false,message:'Invalid or expired session'};
  }

  const user=await r.json();

  if(!user?.id){
    return {ok:false,message:'Invalid user'};
  }

  const lastSignIn=Date.parse(user.last_sign_in_at||'');

  if(
    Number.isFinite(lastSignIn) &&
    Date.now()-lastSignIn>REAUTH_MS
  ){
    return {
      ok:false,
      message:'Reauthentication required'
    };
  }

  return {ok:true,user};
}

function relevance(item,keyword){
  const title=norm(item.itemName);
  const titleCompact=compact(item.itemName);
  const q=norm(keyword);
  const qc=compact(keyword);

  if(!title||!q)return 0;

  let score=0;
  const pos=titleCompact.indexOf(qc);

  if(pos===0)score=100;
  else if(pos>0&&pos<=8)score=96;
  else if(pos>8&&pos<=20)score=91;
  else if(pos>20&&pos<=40)score=84;
  else if(pos>40)score=72;

  const tokens=q.split(' ').filter(Boolean);

  if(tokens.length>1){
    const hit=tokens.filter(t=>title.includes(t)).length;
    const cov=hit/tokens.length;

    if(cov===1)score=Math.max(score,88);
    else if(cov>=.67)score=Math.max(score,76);
    else if(cov>=.5)score=Math.max(score,62);
  }else if(pos<0&&title.includes(q)){
    score=70;
  }

  if(pos>60)score-=8;

  return clamp(Math.round(score));
}

function reviewStrength(x){
  const c=+x.reviewCount||0;
  const a=+x.reviewAverage||0;

  const volume=clamp(Math.log10(c+1)/4*100);
  const confidence=Math.min(1,Math.log10(c+1)/3);
  const rating=clamp(((a-3)/2*100)*(.55+.45*confidence));

  return Math.round(volume*.55+rating*.45);
}

function priceAccessibility(x){
  const p=+x.itemPrice||0;

  if(p<=0)return 0;
  if(p<1000)return 72;
  if(p<=3000)return 94;
  if(p<=10000)return 100;
  if(p<=30000)return 88;
  if(p<=50000)return 72;
  if(p<=100000)return 58;

  return 42;
}

function preferenceScore(x,sort){
  const c=+x.reviewCount||0;
  const a=+x.reviewAverage||0;
  const r=+x.affiliateRate||0;
  const p=+x.itemPrice||0;

  if(sort==='-reviewCount'){
    return clamp(Math.log10(c+1)/4*100);
  }

  if(sort==='-reviewAverage'){
    const conf=Math.min(1,Math.log10(c+1)/3);
    return clamp(((a-3)/2*100)*(.6+.4*conf));
  }

  if(sort==='-affiliateRate'){
    return clamp(r/10*100);
  }

  if(sort==='+itemPrice'){
    return clamp(100-Math.log10(Math.max(1,p))/6*100);
  }

  return 50;
}

function sellabilityScore(x,rel,userSort){
  return Math.round(
    rel*.35+
    reviewStrength(x)*.30+
    priceAccessibility(x)*.20+
    preferenceScore(x,userSort)*.15
  );
}

function profitabilityScore(x){
  const rate=+x.affiliateRate||0;
  const price=+x.itemPrice||0;

  const est=Math.min(1000,price*rate/100);
  const rateScore=clamp(rate/10*100);
  const estScore=clamp(Math.log10(est+1)/3*100);

  return Math.round(rateScore*.70+estScore*.30);
}

module.exports=async function handler(req,res){
  try{
    res.setHeader('Cache-Control','no-store');

    const auth=await verifyUser(req);

    if(!auth.ok){
      return res.status(401).json({
        message:auth.message
      });
    }

    const keyword=String(req.query.keyword||'').trim();
    const minPrice=req.query.minPrice?+req.query.minPrice:null;
    const maxPrice=req.query.maxPrice?+req.query.maxPrice:null;
    const userSort=String(req.query.sort||'standard');

    if(!keyword){
      return res.status(400).json({
        message:'keyword is required'
      });
    }

    const appId=process.env.RAKUTEN_APP_ID;
    const accessKey=process.env.RAKUTEN_ACCESS_KEY;
    const affiliateId=process.env.RAKUTEN_AFFILIATE_ID;

    if(!appId||!accessKey||!affiliateId){
      return res.status(500).json({
        message:'Rakuten API settings are missing'
      });
    }

    const p=new URLSearchParams({
      applicationId:appId,
      affiliateId,
      keyword,
      format:'json',
      formatVersion:'2',
      hits:'30',
      availability:'1',
      sort:'standard'
    });

    if(minPrice!=null&&Number.isFinite(minPrice)){
      p.set('minPrice',String(minPrice));
    }

    if(maxPrice!=null&&Number.isFinite(maxPrice)){
      p.set('maxPrice',String(maxPrice));
    }

    p.set('accessKey',accessKey);

    const url=
      'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701?'
      +p.toString();

    const r=await fetch(url,{
      headers:{
        Origin:'https://rakuten-affiliate-ai-mobile.vercel.app',
        Referer:'https://rakuten-affiliate-ai-mobile.vercel.app/'
      }
    });

    const data=await r.json().catch(()=>({}));

    if(!r.ok){
      return res.status(r.status).json({
        message:
          data?.error_description||
          data?.error||
          'Rakuten API error',
        detail:data
      });
    }

    let items=(
      Array.isArray(data.items)
        ?data.items
        :Array.isArray(data.Items)
          ?data.Items
          :[]
    ).map(v=>v.Item||v);

    const wantsFurusato=/ふるさと納税|寄付/.test(keyword);

    if(!wantsFurusato){
      items=items.filter(x=>
        !/ふるさと納税|寄付額|返礼品/.test(
          String(x.itemName||'')
        )
      );
    }

    let ranked=items.map(x=>{
      const rel=relevance(x,keyword);
      const sell=sellabilityScore(x,rel,userSort);
      const profit=profitabilityScore(x);

      return {
        ...x,
        relevance:rel,
        sellability:sell,
        profitability:profit,
        score:Math.round(sell*.70+profit*.30)
      };
    });

    let pool=ranked.filter(x=>x.relevance>=84);

    if(pool.length<5){
      pool=ranked.filter(x=>x.relevance>=70);
    }

    if(pool.length<5){
      pool=ranked.filter(x=>x.relevance>=50);
    }

    if(pool.length<5){
      pool=ranked;
    }

    pool.sort((a,b)=>
      b.score-a.score||
      b.sellability-a.sellability||
      b.relevance-a.relevance
    );

    const out=pool.slice(0,10).map(x=>({
      itemName:x.itemName,
      itemPrice:+x.itemPrice||0,
      itemUrl:x.itemUrl,
      affiliateUrl:x.affiliateUrl||x.itemUrl,
      reviewCount:+x.reviewCount||0,
      reviewAverage:+x.reviewAverage||0,
      affiliateRate:+x.affiliateRate||0,
      smallImageUrls:x.smallImageUrls||[],
      mediumImageUrls:x.mediumImageUrls||[],
      shopName:x.shopName||'',
      score:x.score,
      relevance:x.relevance,
      sellability:x.sellability,
      profitability:x.profitability,
      estimatedCommission:Math.round(
        Math.min(
          1000,
          (+x.itemPrice||0)*(+x.affiliateRate||0)/100
        )
      )
    }));

    return res.status(200).json({
      items:out,
      count:+data.count||0
    });

  }catch(e){
    return res.status(500).json({
      message:e?.message||'server error'
    });
  }
};
