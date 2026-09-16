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

  let roomAway=false;
  let suppressAuthUntil=0;
  const RETURN_GUIDE_KEY='urenavi_room_return_guide_hidden_v1';

  function ensurePwaHead(){
    try{
      let manifest=root.document.querySelector('link[rel="manifest"]');
      if(!manifest){
        manifest=root.document.createElement('link');
        manifest.rel='manifest';
        root.document.head.appendChild(manifest);
      }
      manifest.href='/manifest.json';

      let apple=root.document.querySelector('link[rel="apple-touch-icon"]');
      if(!apple){
        apple=root.document.createElement('link');
        apple.rel='apple-touch-icon';
        root.document.head.appendChild(apple);
      }
      apple.href='/04A5818A-1E27-4129-B4CC-7DA3C10A8F19.png';
      apple.removeAttribute('sizes');

      let theme=root.document.querySelector('meta[name="theme-color"]');
      if(!theme){
        theme=root.document.createElement('meta');
        theme.name='theme-color';
        root.document.head.appendChild(theme);
      }
      theme.content='#172a4b';
    }catch{}
  }

  ensurePwaHead();

  const durableScript=root.document.createElement('script');
  durableScript.src='/durable-session.js?v=20260916-1';
  durableScript.defer=true;
  root.document.head.appendChild(durableScript);

  function appVisible(){
    const app=root.document.getElementById('appRoot');
    return !!app && app.style.display==='block';
  }

  function isRakutenViewLink(link){
    return !!link && String(link.textContent||'').trim()==='楽天で見る' && /^https:/i.test(link.href||'');
  }

  function restoreSavedSearchOnReturn(){
    if(typeof root.restoreSearchState!=='function') return;
    const email=root.document.getElementById('userMail')?.textContent||'';
    if(!email) return;
    try{root.restoreSearchState(email);}catch{}
  }

  function returnGuideHidden(){
    try{return root.localStorage.getItem(RETURN_GUIDE_KEY)==='1';}catch{return false;}
  }

  function ensureReturnGuide(){
    if(returnGuideHidden() || root.document.getElementById('roomReturnGuide')) return;
    const rakutenLink=Array.from(root.document.querySelectorAll('a')).find(isRakutenViewLink);
    if(!rakutenLink) return;
    const host=rakutenLink.closest('.btns,.acts') || rakutenLink.parentElement;
    if(!host || !host.parentNode) return;

    const guide=root.document.createElement('div');
    guide.id='roomReturnGuide';
    guide.setAttribute('role','note');
    guide.style.cssText='margin-top:8px;padding:10px 34px 10px 10px;border:1px solid #f0dfb5;border-radius:11px;background:#fff9eb;color:#725718;font-size:11px;line-height:1.55;position:relative;';
    guide.textContent='ROOM投稿後に白い画面が出ても、ウレナビを開き直すと「続きから再開」が表示されます。';

    const close=root.document.createElement('button');
    close.type='button';
    close.setAttribute('aria-label','この案内を閉じる');
    close.textContent='×';
    close.style.cssText='position:absolute;right:7px;top:6px;border:0;background:transparent;color:#725718;font-size:18px;line-height:1;padding:4px 6px;';
    close.addEventListener('click',()=>{
      try{root.localStorage.setItem(RETURN_GUIDE_KEY,'1');}catch{}
      guide.remove();
    });
    guide.appendChild(close);
    host.insertAdjacentElement('afterend',guide);
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

    if(isRakutenViewLink(link)){
      try{if(typeof root.saveSearchState==='function') root.saveSearchState();}catch{}
      event.preventDefault();
      event.stopImmediatePropagation();
      root.location.assign(link.href);
    }
  },true);

  function markRoomReturn(){
    if(!roomAway || !appVisible()) return;
    roomAway=false;
    suppressAuthUntil=Date.now()+8000;
  }

  root.addEventListener('pageshow',()=>{
    markRoomReturn();
    restoreSavedSearchOnReturn();
    ensureReturnGuide();
  },true);
  root.document.addEventListener('visibilitychange',()=>{
    if(!root.document.hidden){
      markRoomReturn();
      restoreSavedSearchOnReturn();
      ensureReturnGuide();
    }
  },true);

  function wrapBootAuth(){
    if(typeof root.bootAuth!=='function' || root.__urenaviRoomReturnGuardInstalled) return false;
    const baseBootAuth=root.bootAuth;
    root.bootAuth=function(){
      if(appVisible() && Date.now()<suppressAuthUntil) return Promise.resolve();
      return baseBootAuth.apply(this,arguments);
    };
    root.__urenaviRoomReturnGuardInstalled=true;
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
    ensurePwaHead();
    wrapBootAuth();
    if(!installProductLogic()){
      const timer=setInterval(()=>{if(installProductLogic()) clearInterval(timer);},50);
      setTimeout(()=>clearInterval(timer),5000);
    }
    refreshRankingNote();
    ensureReturnGuide();
    const observer=new MutationObserver(()=>{
      refreshRankingNote();
      ensureReturnGuide();
    });
    observer.observe(root.document.body,{childList:true,subtree:true});
  },{once:true});
})(typeof window==='undefined'?null:window);
