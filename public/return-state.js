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

  const EXTERNAL_KEY='urenavi_external_tab_away_v1';
  const EXTERNAL_MAX_AGE=30*60*1000;
  let roomAway=false;
  let externalAway=false;
  let suppressAuthUntil=0;

  function appVisible(){
    const app=root.document.getElementById('appRoot');
    return !!app && app.style.display==='block';
  }

  function rememberExternalAway(){
    externalAway=true;
    try{root.sessionStorage.setItem(EXTERNAL_KEY,String(Date.now()));}catch{}
    try{if(typeof root.saveSearchState==='function') root.saveSearchState();}catch{}
  }

  function hasFreshExternalAway(){
    try{
      const at=Number(root.sessionStorage.getItem(EXTERNAL_KEY)||0);
      return Number.isFinite(at) && at>0 && Date.now()-at>=0 && Date.now()-at<EXTERNAL_MAX_AGE;
    }catch{return externalAway;}
  }

  function clearExternalAway(){
    externalAway=false;
    try{root.sessionStorage.removeItem(EXTERNAL_KEY);}catch{}
  }

  function forceRepaint(){
    const app=root.document.getElementById('appRoot');
    if(!app || app.style.display!=='block') return;
    try{
      app.style.display='block';
      app.style.visibility='visible';
      app.style.opacity='1';
      void app.offsetHeight;
      app.style.transform='translateZ(0)';
      root.requestAnimationFrame(()=>{app.style.transform='';});
    }catch{}
  }

  root.document.addEventListener('click',event=>{
    const link=event.target.closest?.('a');
    if(!link) return;

    if(link.classList?.contains('roomLink')){
      roomAway=true;
      try{if(typeof root.saveSearchState==='function') root.saveSearchState();}catch{}
      event.preventDefault();
      event.stopImmediatePropagation();
      root.location.assign(link.href);
      return;
    }

    if(link.target==='_blank' && /^https:/i.test(link.href||'')){
      rememberExternalAway();
    }
  },true);

  function markReturn(){
    const returningFromRoom=roomAway;
    const returningFromExternal=externalAway || hasFreshExternalAway();
    if((!returningFromRoom && !returningFromExternal) || !appVisible()) return;
    roomAway=false;
    clearExternalAway();
    suppressAuthUntil=Date.now()+15000;
    forceRepaint();
  }

  root.addEventListener('pageshow',markReturn,true);
  root.document.addEventListener('visibilitychange',()=>{
    if(!root.document.hidden) markReturn();
  },true);
  root.addEventListener('focus',markReturn,true);

  function authSuppressed(){
    return appVisible() && Date.now()<suppressAuthUntil;
  }

  function wrapBootAuth(){
    if(typeof root.bootAuth!=='function' || root.__urenaviRoomReturnGuardInstalled) return false;
    const baseBootAuth=root.bootAuth;
    root.bootAuth=function(){
      if(authSuppressed()){
        forceRepaint();
        return Promise.resolve();
      }
      return baseBootAuth.apply(this,arguments);
    };
    root.__urenaviRoomReturnGuardInstalled=true;
    return true;
  }

  function wrapShowApp(){
    if(typeof root.showApp!=='function' || root.__urenaviReturnShowAppGuardInstalled) return false;
    const baseShowApp=root.showApp;
    root.showApp=function(){
      if(authSuppressed()){
        forceRepaint();
        return Promise.resolve();
      }
      return baseShowApp.apply(this,arguments);
    };
    root.__urenaviReturnShowAppGuardInstalled=true;
    return true;
  }

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

  const rankingNote='総合順位は、売れやすさ・収益性・検索意図との一致度・商品タイプを総合的に評価して算出しています。報酬目安は商品価格×料率の概算で、1商品1個あたり上限1,000円を反映しています。';
  function refreshRankingNote(){
    root.document.querySelectorAll('.compare .muted').forEach(el=>{
      if(el.textContent.includes('総合順位は') && el.textContent!==rankingNote){
        el.textContent=rankingNote;
      }
    });
  }

  root.addEventListener('DOMContentLoaded',()=>{
    wrapBootAuth();
    wrapShowApp();
    if(!installProductLogic()){
      const timer=setInterval(()=>{if(installProductLogic()) clearInterval(timer);},50);
      setTimeout(()=>clearInterval(timer),5000);
    }
    refreshRankingNote();
    const observer=new MutationObserver(refreshRankingNote);
    observer.observe(root.document.body,{childList:true,subtree:true});
  },{once:true});
})(typeof window==='undefined'?null:window);
