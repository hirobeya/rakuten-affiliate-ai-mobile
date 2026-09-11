const coreSearch = require('./search-core');

function isRoomAffiliateEligible(item){
  const affiliateUrl=String(item?.affiliateUrl||'').trim();
  const affiliateRate=Number(item?.affiliateRate||0);
  const itemName=String(item?.itemName||'');
  const shopName=String(item?.shopName||'');
  const haystack=(itemName+' '+shopName).normalize('NFKC');

  if(!/^https:\/\//i.test(affiliateUrl) || !(affiliateRate>0)) return false;

  // Rakuten ROOM official exclusions that can surface from marketplace data.
  if(/楽天Kobo/i.test(haystack)) return false;
  if(/楽天ブックス/i.test(shopName) && /(ダウンロード|DL版|ダウンロード版|デジタル版)/i.test(itemName)) return false;
  if(/(?:第[123一二三]類|指定第?[二2]類|要指導)?医薬品/i.test(itemName)) return false;

  return true;
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
        const items=body.items.filter(isRoomAffiliateEligible);
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
