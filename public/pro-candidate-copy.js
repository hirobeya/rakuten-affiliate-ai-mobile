'use strict';
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.UrenaviProCandidateCopy=api;
})(typeof window!=='undefined'?window:null,function(){
  function httpsUrl(value){
    const text=String(value||'').trim();
    try{const u=new URL(text);return u.protocol==='https:'?u.href:'';}catch{return '';}
  }
  function format(item){
    if(!item||!String(item.itemName||'').trim())return '';
    const lines=[String(item.itemName).trim()];
    const price=Number(item.itemPrice);
    if(Number.isFinite(price)&&price>0)lines.push('価格：'+price.toLocaleString('ja-JP')+'円');
    const url=httpsUrl(item.affiliateUrl)||httpsUrl(item.itemUrl);
    if(url)lines.push(url);
    return lines.join('\n');
  }
  return {format,httpsUrl};
});
