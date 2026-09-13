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
  if(!root || typeof root.fetch!=='function' || root.__urenaviIntentSearchPatched) return;
  const baseFetch=root.fetch.bind(root);
  root.fetch=function(resource,options){
    if(typeof resource==='string' && resource.indexOf('/api/search?')===0){
      resource='/api/search-v2?'+resource.substring('/api/search?'.length);
    }
    return baseFetch(resource,options);
  };
  root.__urenaviIntentSearchPatched=true;
})(typeof window==='undefined'?null:window);

(function(root){
  if(!root || !root.document) return;
  const script=root.document.createElement('script');
  script.src='/pain-copy.js?v=20260913-3';
  script.defer=true;
  script.onload=()=>{
    const refine=root.document.createElement('script');
    refine.src='/pain-copy-refine.js?v=20260913-1';
    refine.defer=true;
    refine.onload=()=>{
      const contextFix=root.document.createElement('script');
      contextFix.src='/pain-copy-context-fix.js?v=20260913-2';
      contextFix.defer=true;
      root.document.head.appendChild(contextFix);
    };
    root.document.head.appendChild(refine);
  };
  root.document.head.appendChild(script);

  function installProductLogic(){
    if(!root.UrenaviPainCopy) return false;
    const originalPost=root.post;
    if(typeof originalPost==='function' && !root.__urenaviPostPatched){
      root.post=function(item,platform='room'){
        if(platform!=='room' || !root.UrenaviPainCopy) return originalPost(item,platform);
        const keyword=root.document.getElementById('k')?.value?.trim()||'';
        return root.UrenaviPainCopy.makeRoomCopy(item,keyword);
      };
      root.__urenaviPostPatched=true;
    }
    if(typeof root.aud==='function' && !root.__urenaviAudPatched){
      root.aud=function(item){
        const keyword=root.document.getElementById('k')?.value?.trim()||'';
        return root.UrenaviPainCopy.painContext(item?.itemName||'',keyword).audience;
      };
      root.__urenaviAudPatched=true;
    }
    if(typeof root.pts==='function' && !root.__urenaviPtsPatched){
      root.pts=function(item){
        const keyword=root.document.getElementById('k')?.value?.trim()||'';
        return root.UrenaviPainCopy.analysisPoints(item,keyword);
      };
      root.__urenaviPtsPatched=true;
    }
    return !!root.__urenaviPostPatched;
  }

  root.addEventListener('DOMContentLoaded',()=>{
    if(installProductLogic()) return;
    const timer=setInterval(()=>{if(installProductLogic()) clearInterval(timer);},50);
    setTimeout(()=>clearInterval(timer),5000);
  },{once:true});
})(typeof window==='undefined'?null:window);
