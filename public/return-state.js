(function(root){
  const KEY='urenavi_search_return_v1';
  const MAX_AGE=30*60*1000;
  function clear(storage){try{storage.removeItem(KEY);}catch{}}
  function save(storage,state,now=Date.now()){
    try{
      const value=JSON.stringify({...state,at:now});
      if(value.length>500000) return false;
      storage.setItem(KEY,value);
      return true;
    }catch{return false;}
  }
  function load(storage,email,now=Date.now()){
    try{
      const value=JSON.parse(storage.getItem(KEY)||'null');
      if(!value) return null;
      if(!email || value.email!==email || !Number.isFinite(value.at) || now-value.at<0 || now-value.at>MAX_AGE || !Array.isArray(value.items) || value.items.length>10 || value.items.some(i=>!i || typeof i!=='object' || typeof i.itemName!=='string')){
        clear(storage);return null;
      }
      return value;
    }catch{clear(storage);return null;}
  }
  const api={save,load,clear};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  else root.UrenaviReturnState=api;
})(typeof window==='undefined'?{}:window);

(function(root){
  if(!root || !root.document) return;
  const script=root.document.createElement('script');
  script.src='/pain-copy.js?v=20260913-1';
  script.defer=true;
  root.document.head.appendChild(script);

  root.addEventListener('DOMContentLoaded',()=>{
    const original=root.post;
    if(typeof original!=='function') return;
    root.post=function(item,platform='room'){
      if(platform!=='room' || !root.UrenaviPainCopy) return original(item,platform);
      const keyword=root.document.getElementById('k')?.value?.trim()||'';
      let url='#';
      try{
        const u=new URL(item.affiliateUrl||item.itemUrl||'');
        if(u.protocol==='https:') url=u.href;
      }catch{}
      return root.UrenaviPainCopy.makeRoomCopy(item,keyword,url);
    };
  },{once:true});
})(typeof window==='undefined'?null:window);
