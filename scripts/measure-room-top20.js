'use strict';

const fs=require('fs');
const path=require('path');

const searchModule=require('../api/search.js');
const {relevance,sellabilityScore,profitabilityScore}=searchModule._measurementInternals||{};

global.window={};
require('../public/pain-copy.js');
require('../public/room-copy-quality.js');
const copyApi=global.window.UrenaviPainCopy;

const keywords=['収納ボックス','モバイルバッテリー','ペット用品','掃除便利グッズ'];
const appId=process.env.RAKUTEN_APP_ID;
const accessKey=process.env.RAKUTEN_ACCESS_KEY;
const affiliateId=process.env.RAKUTEN_AFFILIATE_ID;

if(!appId||!accessKey||!affiliateId){
  console.error('Missing RAKUTEN_APP_ID / RAKUTEN_ACCESS_KEY / RAKUTEN_AFFILIATE_ID');
  process.exit(2);
}
if(!relevance||!sellabilityScore||!profitabilityScore){
  console.error('Search scoring helpers are unavailable.');
  process.exit(2);
}

const norm=s=>String(s||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();

async function fetchItems(keyword){
  const p=new URLSearchParams({
    applicationId:appId,
    accessKey,
    affiliateId,
    keyword,
    format:'json',
    formatVersion:'2',
    hits:'30',
    availability:'1',
    sort:'standard'
  });
  const url='https://openapi.rakuten.co.jp/ichibams/api/IchibaItem/Search/20260701?'+p.toString();
  const r=await fetch(url,{headers:{Origin:'https://rakuten-affiliate-ai-mobile.vercel.app',Referer:'https://rakuten-affiliate-ai-mobile.vercel.app/'}});
  if(!r.ok) throw new Error('Rakuten API '+r.status);
  const data=await r.json();
  let items=(Array.isArray(data.items)?data.items:Array.isArray(data.Items)?data.Items:[]).map(v=>v.Item||v);
  if(!/ふるさと納税|寄付/.test(keyword)){
    items=items.filter(x=>!/ふるさと納税|寄付額|返礼品/.test(String(x.itemName||'')));
  }
  const ranked=items.map(x=>{
    const rel=relevance(x,keyword);
    const sell=sellabilityScore(x,rel,'standard');
    const profit=profitabilityScore(x);
    return {...x,relevance:rel,sellability:sell,profitability:profit,score:Math.round(sell*.70+profit*.30)};
  });
  let pool=ranked.filter(x=>x.relevance>=84);
  if(pool.length<5) pool=ranked.filter(x=>x.relevance>=70);
  if(pool.length<5) pool=ranked.filter(x=>x.relevance>=50);
  if(pool.length<5) pool=ranked;
  pool.sort((a,b)=>b.score-a.score||b.sellability-a.sellability||b.relevance-a.relevance);
  return pool.slice(0,20);
}

function fallbackReason(a){
  if(a.ambiguous) return 'ambiguous';
  if(a.conflicts&&a.conflicts.length) return 'conflict';
  if(!a.supported) return 'unsupported_usage';
  if(a.legalRisk) return 'legalRisk';
  return 'other';
}

(async()=>{
  const report={generatedAt:new Date().toISOString(),keywords:{}};
  for(const keyword of keywords){
    const rows=await fetchItems(keyword);
    const out=rows.map((x,index)=>{
      const item={
        itemName:x.itemName,
        itemPrice:+x.itemPrice||0,
        catchcopy:String(x.catchcopy||'').slice(0,500),
        itemCaption:norm(x.itemCaption).slice(0,1200),
        genreName:'',
        genrePath:'',
        reviewCount:+x.reviewCount||0,
        reviewAverage:+x.reviewAverage||0,
        affiliateRate:+x.affiliateRate||0,
        estimatedCommission:Math.round(Math.min(1000,(+x.itemPrice||0)*(+x.affiliateRate||0)/100))
      };
      const a=copyApi.analyzeRoomProduct(item,keyword);
      const copy=copyApi.makeRoomCopy(item,keyword,{variant:index});
      return {
        rank:index+1,
        itemName:item.itemName,
        category:a.category,
        usage:a.usage,
        ambiguous:a.ambiguous,
        legalRisk:a.legalRisk,
        outputMode:a.outputMode,
        fallbackReason:a.outputMode==='fallback'?fallbackReason(a):null,
        copy
      };
    });
    const full=out.filter(x=>x.outputMode==='full').length;
    const fallback=out.length-full;
    const reasons={};
    for(const row of out.filter(x=>x.outputMode==='fallback')){
      reasons[row.fallbackReason]=(reasons[row.fallbackReason]||0)+1;
    }
    report.keywords[keyword]={
      total:out.length,
      full,
      fallback,
      fallbackRate:out.length?Math.round(fallback/out.length*1000)/10:0,
      reasons,
      firstFiveFullCopies:out.filter(x=>x.outputMode==='full').slice(0,5).map(x=>({rank:x.rank,itemName:x.itemName,copy:x.copy})),
      rows
    };
  }
  const outputPath=path.join(__dirname,'..','tmp','room-top20-report.json');
  fs.mkdirSync(path.dirname(outputPath),{recursive:true});
  fs.writeFileSync(outputPath,JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
  console.error('Saved '+outputPath);
})().catch(err=>{
  console.error(err&&err.stack||String(err));
  process.exit(1);
});
