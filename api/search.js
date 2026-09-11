const coreSearch = require('./search-core');

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
    json(body){
      if(statusCode===200 && body && Array.isArray(body.items)){
        const items=[];
        for(const item of body.items){
          const eligibility=roomEligibility(item);
          if(!eligibility.ok) continue;
          items.push({...item,roomItemUrl:eligibility.roomItemUrl,roomEligible:true});
        }
        return res.status(200).json({
          ...body,
          items,
          count:items.length,
          roomAffiliateFiltered:true
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
