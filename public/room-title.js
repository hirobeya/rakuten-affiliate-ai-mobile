(function(root){
  'use strict';

  function pickPromos(title){
    const s=String(title||'');
    const tests=[
      /\d{1,2}[％%](?:OFF|オフ)/i,
      /半額/,
      /送料無料/,
      /クーポン/,
      /ポイント\d{1,2}倍/,
      /期間限定/,
      /数量限定/,
      /公式/,
      /正規品/,
      /ランキング1位/,
      /楽天1位/
    ];
    const out=[];
    for(const re of tests){
      const m=s.match(re);
      if(m && !out.includes(m[0])) out.push(m[0]);
    }
    return out.slice(0,3);
  }

  function shortTitle(title){
    const original=String(title||'').replace(/\s+/g,' ').trim();
    const promos=pickPromos(original);
    let base=original
      .replace(/【[^】]{0,40}】/g,' ')
      .replace(/\[[^\]]{0,40}\]/g,' ')
      .replace(/\s+/g,' ')
      .trim();

    if(base.length>46) base=base.slice(0,46).trim()+'…';
    const prefix=promos.length?'【'+promos.join('・')+'】 ':'';
    return prefix+base;
  }

  function install(){
    if(!root.UrenaviPainCopy || root.UrenaviPainCopy.__titlePatched) return false;
    const original=root.UrenaviPainCopy.makeRoomCopy;
    root.UrenaviPainCopy.makeRoomCopy=function(item,keyword){
      const text=original(item,keyword);
      const oldTitle=String(item&&item.itemName||'');
      if(!oldTitle) return text;
      return text.replace(oldTitle,shortTitle(oldTitle));
    };
    root.UrenaviPainCopy.shortTitle=shortTitle;
    root.UrenaviPainCopy.pickPromos=pickPromos;
    root.UrenaviPainCopy.__titlePatched=true;
    return true;
  }

  if(!install()){
    const timer=setInterval(()=>{
      if(install()) clearInterval(timer);
    },50);
    setTimeout(()=>clearInterval(timer),5000);
  }
})(typeof window==='undefined'?{}:window);
