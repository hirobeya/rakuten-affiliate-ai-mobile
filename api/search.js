const {searchCaptionText}=require('../lib/urenavi-core/source-passages');
const {authorize,db} = require('../lib/billing');
const {isModeAPreview,approvedSlot,isApprovedDeployment,hasThreeCandidates}=require('../lib/mode-a-preview');
const clamp=(n,min=0,max=100)=>
Math.max(
  min,
  Math.min(max,n)
);

const norm=s=>
String(s||'')
.normalize('NFKC')
.toLowerCase()
.replace(/\s+/g,' ')
.trim();

const compact=s=>
norm(s)
.replace(/\s+/g,'');

function normalizeSearchKeyword(keyword){
  const raw=String(keyword||'').normalize('NFKC').trim();
  const compactRaw=raw.replace(/\s+/g,'');
  const aliases=new Map([
    ['ハンディークリーナー','ハンディクリーナー'],
    ['ハンディー掃除機','ハンディ掃除機'],
    ['ハンディークリーナ','ハンディクリーナー']
  ]);
  return aliases.get(compactRaw)||raw;
}


const genreCache=new Map();

async function fetchGenreMeta(genreId,appId,accessKey){
  const id=String(genreId||'').trim();
  if(!id) return {genreName:'',genrePath:''};
  if(genreCache.has(id)) return genreCache.get(id);

  const task=(async()=>{
    try{
      const p=new URLSearchParams({
        applicationId:appId,
        accessKey,
        genreId:id,
        format:'json',
        formatVersion:'2'
      });
      const r=await fetch(
        'https://openapi.rakuten.co.jp/ichibagt/api/IchibaGenre/Search/20260701?'+p.toString(),
        {signal:AbortSignal.timeout(4500)}
      );
      if(!r.ok) return {genreName:'',genrePath:''};
      const data=await r.json().catch(()=>({}));
      const current=data.genre||data.currentGenre||data.current||{};
      const ancestors=Array.isArray(data.ancestors)?data.ancestors:[];
      const names=ancestors
        .map(x=>String(x?.nameJa||x?.genreName||'').trim())
        .filter(Boolean);
      const genreName=String(current?.nameJa||current?.genreName||'').trim();
      if(genreName && names[names.length-1]!==genreName) names.push(genreName);
      return {genreName,genrePath:names.join(' > ')};
    }catch{
      return {genreName:'',genrePath:''};
    }
  })();

  genreCache.set(id,task);
  return task;
}


function relevance(
  item,
  keyword
){

  const title=
  norm(
    item.itemName
  );

  const titleCompact=
  compact(
    item.itemName
  );

  const q=
  norm(
    keyword
  );

  const qc=
  compact(
    keyword
  );


  if(
    !title||
    !q
  ){
    return 0;
  }


  let score=0;

  const pos=
  titleCompact
  .indexOf(qc);


  if(pos===0){
    score=100;
  }
  else if(
    pos>0&&
    pos<=8
  ){
    score=96;
  }
  else if(
    pos>8&&
    pos<=20
  ){
    score=91;
  }
  else if(
    pos>20&&
    pos<=40
  ){
    score=84;
  }
  else if(
    pos>40
  ){
    score=72;
  }


  const tokens=
  q
  .split(' ')
  .filter(Boolean);


  if(
    tokens.length>1
  ){

    const hit=
    tokens
    .filter(
      t=>
      title.includes(t)
    )
    .length;

    const cov=
    hit/
    tokens.length;


    if(cov===1){
      score=
      Math.max(
        score,
        88
      );
    }
    else if(cov>=.67){
      score=
      Math.max(
        score,
        76
      );
    }
    else if(cov>=.5){
      score=
      Math.max(
        score,
        62
      );
    }

  }
  else if(
    pos<0&&
    title.includes(q)
  ){

    score=70;

  }


  if(pos>60){
    score-=8;
  }


  return clamp(
    Math.round(score)
  );

}


function reviewStrength(x){

  const c=
  +x.reviewCount||
  0;

  const a=
  +x.reviewAverage||
  0;


  const volume=
  clamp(
    Math.log10(
      c+1
    )/
    4*
    100
  );


  const confidence=
  Math.min(
    1,
    Math.log10(
      c+1
    )/
    3
  );


  const rating=
  clamp(
    (
      (a-3)/
      2*
      100
    )*
    (
      .55+
      .45*
      confidence
    )
  );


  return Math.round(
    volume*.55+
    rating*.45
  );

}


function priceAccessibility(x){

  const p=
  +x.itemPrice||
  0;


  if(p<=0){
    return 0;
  }

  if(p<1000){
    return 72;
  }

  if(p<=3000){
    return 94;
  }

  if(p<=10000){
    return 100;
  }

  if(p<=30000){
    return 88;
  }

  if(p<=50000){
    return 72;
  }

  if(p<=100000){
    return 58;
  }

  return 42;

}


function preferenceScore(
  x,
  sort
){

  const c=
  +x.reviewCount||
  0;

  const a=
  +x.reviewAverage||
  0;

  const r=
  +x.affiliateRate||
  0;

  const p=
  +x.itemPrice||
  0;


  if(
    sort===
    '-reviewCount'
  ){

    return clamp(
      Math.log10(
        c+1
      )/
      4*
      100
    );

  }


  if(
    sort===
    '-reviewAverage'
  ){

    const conf=
    Math.min(
      1,
      Math.log10(
        c+1
      )/
      3
    );

    return clamp(
      (
        (a-3)/
        2*
        100
      )*
      (
        .6+
        .4*
        conf
      )
    );

  }


  if(
    sort===
    '-affiliateRate'
  ){

    return clamp(
      r/
      10*
      100
    );

  }


  if(
    sort===
    '+itemPrice'
  ){

    return clamp(
      100-
      Math.log10(
        Math.max(
          1,
          p
        )
      )/
      6*
      100
    );

  }


  return 50;

}


function sellabilityScore(
  x,
  rel,
  userSort
){

  return Math.round(
    rel*.35+
    reviewStrength(x)*.30+
    priceAccessibility(x)*.20+
    preferenceScore(
      x,
      userSort
    )*.15
  );

}


function profitabilityScore(x){

  const rate=
  +x.affiliateRate||
  0;

  const price=
  +x.itemPrice||
  0;


  const est=
  Math.min(
    1000,
    price*
    rate/
    100
  );


  const rateScore=
  clamp(
    rate/
    10*
    100
  );


  const estScore=
  clamp(
    est/
    1000*
    100
  );


  return Math.round(
    rateScore*.20+
    estScore*.80
  );

}


function createHandler(deps={}){
  const authorizeFn=deps.authorize||authorize;
  const attemptDb=deps.attemptDb||db;
  const send=deps.fetch||((...args)=>fetch(...args));
  return async function handler(req,res){

  const modeA=isModeAPreview();
  if(modeA?req.method!=='POST':req.method && req.method!=='GET') return res.status(405).json({message:'Method not allowed'});
  try{

    res.setHeader(
      'Cache-Control',
      'no-store'
    );


    const auth=
    await authorizeFn(
      req
    );


    if(!auth.ok){

      return res
      .status(
        auth.status||
        401
      )
      .json({
        message:
        auth.status === 403 ? 'subscription_required' : 'Authentication required'
      });

    }


    const trial=modeA?approvedSlot(req.body):null;
    if(modeA&&auth.plan!=='owner')return res.status(403).json({message:'隔離管理者のみ検索できます。'});
    if(modeA&&!trial)return res.status(400).json({message:'承認済みの検証枠を選んでください。'});
    const query=trial||req.query;

    const keyword=
    normalizeSearchKeyword(
      query.keyword||
      ''
    );


    const minPrice=
    query.minPrice
    ?
    +query.minPrice
    :
    null;


    const maxPrice=
    query.maxPrice
    ?
    +query.maxPrice
    :
    null;


    const userSort=
    String(
      query.sort||
      'standard'
    );


    if(!keyword){

      return res
      .status(400)
      .json({
        message:
        'keyword is required'
      });

    }


    if (keyword.length > 128 || !['standard','-reviewCount','-reviewAverage','-affiliateRate','+itemPrice'].includes(userSort) || [minPrice,maxPrice].some(x=>x!==null && (!Number.isSafeInteger(x) || x<0)) || (minPrice!==null && maxPrice!==null && minPrice>maxPrice)) return res.status(400).json({message:'検索条件を確認してください。'});

    const appId=
    process.env.RAKUTEN_APP_ID;

    const accessKey=
    process.env.RAKUTEN_ACCESS_KEY;

    const affiliateId=
    process.env.RAKUTEN_AFFILIATE_ID;


    if(
      !appId||
      !accessKey||
      !affiliateId
    ){

      return res
      .status(500)
      .json({
        message:
        'Rakuten API settings are missing'
      });

    }


    const p=
    new URLSearchParams({
      applicationId:
      appId,
      affiliateId,
      keyword,
      format:'json',
      formatVersion:'2',
      hits:'30',
      availability:'1',
      sort:'standard'
    });


    if(
      minPrice!=null&&
      Number.isFinite(
        minPrice
      )
    ){

      p.set(
        'minPrice',
        String(
          minPrice
        )
      );

    }


    if(
      maxPrice!=null&&
      Number.isFinite(
        maxPrice
      )
    ){

      p.set(
        'maxPrice',
        String(
          maxPrice
        )
      );

    }


    p.set(
      'accessKey',
      accessKey
    );


    const url=
    'https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701?'+
    p.toString();


    if(trial){
      if(!isApprovedDeployment(affiliateId))return res.status(403).json({message:'配備SHAと本人の提携IDが未確認です。送信はありません。'});
      const claimed=await attemptDb('rpc/urenavi_claim_mode_a_preview',{
        method:'POST',body:JSON.stringify({p_slot:trial.slot})
      });
      if(claimed!==true)return res.status(409).json({message:'検証枠が使用済み、条件未成立、または安全停止中です。送信はありません。'});
    }
    const r=
    await send(
      url,
      {
        signal:AbortSignal.timeout(12000),
        ...(trial?{redirect:'error'}:{}),
        headers:{
          Origin:
          'https://rakuten-affiliate-ai-mobile.vercel.app',
          Referer:
          'https://rakuten-affiliate-ai-mobile.vercel.app/'
        }
      }
    );


    const data=
    await r.json()
    .catch(error=>{if(trial)throw error;return {};});


    if(!r.ok){

      return res
      .status(
        r.status===429?429:502
      )
      .json({
        message:'商品データを取得できませんでした。'
      });

    }


    if(trial&&!Array.isArray(data.items)&&!Array.isArray(data.Items))
      return res.status(502).json({message:'楽天の応答形式を確認できません。検証を停止しました。'});

    let items=
    (
      Array.isArray(
        data.items
      )
      ?
      data.items
      :
      Array.isArray(
        data.Items
      )
      ?
      data.Items
      :
      []
    )
    .map(
      v=>
      v.Item||
      v
    );


    if(trial&&items.some(item=>!(typeof item.itemCode==='string'&&item.itemCode&&
      typeof item.itemName==='string'&&item.itemName&&Number.isFinite(Number(item.itemPrice))&&
      /^https:\/\/(?:item|hb\.afl)\.rakuten\.co\.jp\//.test(item.itemUrl||''))))
      return res.status(502).json({message:'必要な商品情報を確認できません。検証を停止しました。'});

    const wantsFurusato=
    /ふるさと納税|寄付/
    .test(
      keyword
    );


    if(
      !wantsFurusato
    ){

      items=
      items.filter(
        x=>
        !/ふるさと納税|寄付額|返礼品/
        .test(
          String(
            x.itemName||
            ''
          )
        )
      );

    }


    let ranked=
    items.map(
      x=>{

        const rel=
        relevance(
          x,
          keyword
        );

        const sell=
        sellabilityScore(
          x,
          rel,
          userSort
        );

        const profit=
        profitabilityScore(
          x
        );


        return{
          ...x,
          relevance:
          rel,
          sellability:
          sell,
          profitability:
          profit,
          score:
          Math.round(
            sell*.70+
            profit*.30
          )
        };

      }
    );


    let pool=
    ranked.filter(
      x=>
      x.relevance>=84
    );


    if(
      pool.length<5
    ){

      pool=
      ranked.filter(
        x=>
        x.relevance>=70
      );

    }


    if(
      pool.length<5
    ){

      pool=
      ranked.filter(
        x=>
        x.relevance>=50
      );

    }


    if(
      pool.length<5
    ){

      pool=
      ranked;

    }


    pool.sort(
      (a,b)=>
      b.score-a.score||
      b.sellability-a.sellability||
      b.relevance-a.relevance
    );


    const selected=
    pool
    .slice(0,10);

    const uniqueGenreIds=[...new Set(selected.map(x=>String(x.genreId||'')).filter(Boolean))];
    const genrePairs=trial?[]:await Promise.all(
      uniqueGenreIds.map(async id=>[id,await fetchGenreMeta(id,appId,accessKey)])
    );
    const genreById=new Map(genrePairs);

    const out=
    selected
    .map(
      x=>({
        ...genreById.get(String(x.genreId||'')),

        itemName:
        x.itemName,

        itemPrice:
        +x.itemPrice||
        0,

        catchcopy:
        String(x.catchcopy||'').slice(0,500),

        itemCaption:
        searchCaptionText(x.itemCaption),

        genreId:
        String(x.genreId||''),

        itemCode:
        String(x.itemCode||''),

        itemUrl:
        x.itemUrl,

        affiliateUrl:
        x.affiliateUrl||
        x.itemUrl,

        reviewCount:
        +x.reviewCount||
        0,

        reviewAverage:
        +x.reviewAverage||
        0,

        affiliateRate:
        +x.affiliateRate||
        0,

        smallImageUrls:
        x.smallImageUrls||
        [],

        mediumImageUrls:
        x.mediumImageUrls||
        [],

        shopName:
        x.shopName||
        '',

        score:
        x.score,

        relevance:
        x.relevance,

        sellability:
        x.sellability,

        profitability:
        x.profitability,

        estimatedCommission:
        Math.round(
          Math.min(
            1000,
            (
              +x.itemPrice||
              0
            )*
            (
              +x.affiliateRate||
              0
            )/
            100
          )
        )

      })
    );


    if(trial){
      const finished=await attemptDb('rpc/urenavi_finish_mode_a_preview',{
        method:'POST',body:JSON.stringify({p_slot:trial.slot,p_has_three:hasThreeCandidates(out)})
      });
      if(finished!==true)return res.status(503).json({message:'検索の記録が確定しません。検証を停止しました。'});
    }
    return res
    .status(200)
    .json({
      items:
      out,
      count:
      +data.count||
      0,
      ...(trial?{modeAKeyword:trial.keyword}:{})
    });


  }catch(e){

    console.error('Search request failed',e?.name==='TimeoutError'?'upstream_timeout':'upstream_error');
    if(e?.name==='TimeoutError' || e?.name==='AbortError') return res.status(504).json({message:'商品検索が時間内に完了しませんでした。もう一度お試しください。'});

    return res
    .status(500)
    .json({
      message:
      '処理を完了できませんでした。時間をおいて再度お試しください。'
    });

  }

  };
}

module.exports=createHandler();
module.exports.createHandler=createHandler;


module.exports._measurementInternals={
  relevance,
  sellabilityScore,
  profitabilityScore,
  normalizeSearchKeyword
};
