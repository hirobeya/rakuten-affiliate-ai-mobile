(function(root){
  const KEY='urenavi_search_return_v1';
  const MAX_AGE=30*60*1000;
  const RAKUTEN_RETURN_KEY='urenavi_rakuten_view_return_v1';
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

  if(typeof window!=='undefined' && typeof document!=='undefined'){
    let recovering=false;

    const isRakutenViewLink=link=>{
      if(!link || String(link.textContent||'').trim()!=='楽天で見る') return false;
      try{
        const u=new URL(link.href,window.location.href);
        return u.protocol==='https:' && (u.hostname==='rakuten.co.jp' || u.hostname.endsWith('.rakuten.co.jp'));
      }catch{return false;}
    };

    document.addEventListener('click',event=>{
      const link=event.target.closest?.('a');
      if(!isRakutenViewLink(link)) return;
      try{if(typeof root.saveSearchState==='function') root.saveSearchState();}catch{}
      try{sessionStorage.setItem(RAKUTEN_RETURN_KEY,String(Date.now()));}catch{}
    },true);

    const recover=()=>{
      if(recovering || document.hidden) return;
      let at=0;
      try{at=Number(sessionStorage.getItem(RAKUTEN_RETURN_KEY)||0);}catch{}
      if(!at) return;
      const age=Date.now()-at;
      if(age<0 || age>MAX_AGE){
        try{sessionStorage.removeItem(RAKUTEN_RETURN_KEY);}catch{}
        return;
      }
      recovering=true;
      try{sessionStorage.removeItem(RAKUTEN_RETURN_KEY);}catch{}
      window.location.replace('/app.html?rakuten_return=1&t='+Date.now());
    };

    window.addEventListener('pageshow',recover);
    window.addEventListener('focus',()=>setTimeout(recover,80));
    document.addEventListener('visibilitychange',()=>{
      if(!document.hidden) setTimeout(recover,80);
    });
  }
})(typeof window==='undefined'?{}:window);
