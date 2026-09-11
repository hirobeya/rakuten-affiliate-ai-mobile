const coreSearch = require('./search-core');

const ROOM_VERIFY_TIMEOUT_MS=1800;
const ROOM_VERIFY_CACHE_MS=60*60*1000;
const roomVerifyCache=new Map();

function decodeUrlCandidate(value){
  let current=String(value||'').trim();
  for(let i=0;i<3;i++){
    if(!current) break;
    try{
      const decoded=decodeURIComponent(current);
      if(decoded===current) break;
      current=decoded;
    }catch{break;}
  }
  return current;
}

function canonicalRoomItemUrl(item){
  const candidates=[item?.itemUrl,item?.affiliateUrl].filter(Boolean);
  for(const raw of candidates){
    try{
      const u=new URL(String(raw));
      if(u.protocol!=='https:') continue;

      if(u.hostname==='item.rakuten.co.jp' || u.hostname==='books.rakuten.co.jp'){
        u.search='';
        u.hash='';
        return u.href;
      }

      for(const key of ['pc','m','url']){
        const target=decodeUrlCandidate(u.searchParams.get(key));
        if(!target) continue;
        try{
          const t=new URL(target);
          if(t.protocol==='https:' && (t.hostname==='item.rakuten.co.jp' || t.hostname==='books.rakuten.co.jp')){
            t.search='';
            t.hash='';
            return t.href;
          }
        }catch{}
      }
    }catch{}
  }
  return '';
}

function roomEligibility(item){
  const affiliateUrl=String(item?.affiliateUrl||'').trim();
  const affiliateRate=Number(item?.affiliateRate||0);
  const itemName=String(item?.itemName||'');
  const shopName=String(item?.shopName||'');
  const haystack=(itemName+' '+shopName).normalize('NFKC');
  const roomItemUrl=canonicalRoomItemUrl(item);

  if(!/^https:\/\//i.test(affiliateUrl) || !(affiliateRate>0)) return {ok:false,reason:'affiliate'};
  if(!roomItemUrl) return {ok:false,reason:'room-url'};

  if(/楽天Kobo|Rakuten\s*Kobo/i.test(haystack)) return {ok:false,reason:'kobo'};
  if(/kobo\.rakuten\.co\.jp/i.test(roomItemUrl)) return {ok:false,reason:'kobo'};
  if(/books\.rakuten\.co\.jp\/rk\//i.test(roomItemUrl)) return {ok:false,reason:'ebook'};
  if(/楽天ブックス/i.test(shopName) && /(ダウンロード|DL版|ダウンロード版|デジタル版|電子書籍|ebook)/i.test(itemName)) return {ok:false,reason:'download'};
  if(/(?:指定)?第\s*[123一二三]\s*類\s*医薬品|要指導医薬品|医薬品/i.test(itemName)) return {ok:false,reason:'medicine'};

  return {ok:true,roomItemUrl};
}

function hasRoomPostingSignal(html){
  const text=String(html||'');
  return (
    /room\.rakuten\.co\.jp/i.test(text) ||
    /ROOMに投稿/i.test(text) ||
    /ROOMで投稿/i.test(text) ||
    /ROOMアイコン/i.test(text) ||
    /data-[^=]*room/i.test(text) ||
    /(?:href|url)[^>]{0,220}room\.rakuten\.co\.jp/i.test(text)
  );
}

async function verifyRoomPostable(roomItemUrl){
  const key=String(roomItemUrl||'');
  if(!key) return false;

  const cached=roomVerifyCache.get(key);
  if(cached && Date.now()-cached.at<ROOM_VERIFY_CACHE_MS) return cached.ok;

  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),ROOM_VERIFY_TIMEOUT_MS);
  let ok=false;
  try{
    const response=await fetch(key,{
      method:'GET',
      redirect:'follow',
      signal:controller.signal,
      headers:{
        'User-Agent':'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1',
        'Accept':'text/html,application/xhtml+xml',
        'Accept-Language':'ja-JP,ja;q=0.9'
      }
    });
    if(!response.ok){
      ok=false;
    }else{
      const finalUrl=new URL(response.url||key);
      if(finalUrl.hostname!=='item.rakuten.co.jp' && finalUrl.hostname!=='books.rakuten.co.jp'){
        ok=false;
      }else{
        const html=await response.text();
        ok=hasRoomPostingSignal(html);
      }
    }
  }catch{
    ok=false;
  }finally{
    clearTimeout(timer);
  }

  roomVerifyCache.set(key,{ok,at:Date.now()});
  return ok;
}

async function filterVerifiedRoomItems(items){
  const source=Array.isArray(items)?items:[];
  const prepared=[];
  for(const item of source){
    const eligibility=roomEligibility(item);
    if(!eligibility.ok) continue;
    prepared.push({item,roomItemUrl:eligibility.roomItemUrl});
  }

  const verified=await Promise.all(prepared.map(async entry=>({
    ...entry,
    ok:await verifyRoomPostable(entry.roomItemUrl)
  })));

  return verified
    .filter(entry=>entry.ok)
    .map(entry=>({...entry.item,roomItemUrl:entry.roomItemUrl,roomEligible:true,roomVerified:true}));
}

function isRoomAffiliateEligible(item){
  return roomEligibility(item).ok;
}

module.exports=async function handler(req,res){
  let statusCode=200;

  const proxy={
    setHeader:(...args)=>res.setHeader(...args),
    status(code){
      statusCode=code;
      return proxy;
    },
    async json(body){
      if(statusCode===200 && body && Array.isArray(body.items)){
        const items=await filterVerifiedRoomItems(body.items);
        return res.status(200).json({
          ...body,
          items,
          count:items.length,
          roomAffiliateFiltered:true,
          roomPostabilityVerified:true
        });
      }
      return res.status(statusCode).json(body);
    }
  };

  return coreSearch(req,proxy);
};

module.exports.isRoomAffiliateEligible=isRoomAffiliateEligible;
module.exports.roomEligibility=roomEligibility;
module.exports.canonicalRoomItemUrl=canonicalRoomItemUrl;
module.exports.hasRoomPostingSignal=hasRoomPostingSignal;
module.exports.verifyRoomPostable=verifyRoomPostable;
