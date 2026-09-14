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

  const ua=root.navigator?.userAgent||'';
  const inApp=/ChatGPT|OpenAI|FBAN|FBAV|Instagram|Line\/|Twitter|X\b|MicroMessenger|TikTok|Snapchat|Pinterest|LinkedInApp|GSA|GoogleApp|YJApp|Yahoo|DuckDuckGo/i.test(ua);
  const params=new URLSearchParams(root.location.search);
  if(inApp && params.get('external')!=='1' && root.location.pathname.endsWith('/app.html')){
    const gate=new URL('/open-app.html',root.location.origin);
    if(params.get('activated')==='1') gate.searchParams.set('activated','1');
    root.location.replace(gate.href);
    return;
  }

  let roomAway=false;
  let suppressAuthUntil=0;

  function appVisible(){
    const app=root.document.getElementById('appRoot');
    return !!app && app.style.display==='block';
  }

  root.document.addEventListener('click',event=>{
    const link=event.target.closest?.('a.roomLink');
    if(!link) return;
    roomAway=true;
    try{if(typeof root.saveSearchState==='function') root.saveSearchState();}catch{}

    let roomUrl='';
    try{
      const u=new URL(link.href,root.location.href);
      if(u.protocol==='https:' && u.hostname==='room.rakuten.co.jp') roomUrl=u.href;
    }catch{}
    if(!roomUrl) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    const bridge=new URL('/room-bridge.html',root.location.origin);
    bridge.searchParams.set('to',roomUrl);
    const opened=root.open(bridge.href,'_blank','noopener,noreferrer');
    if(!opened) root.location.assign(bridge.href);
  },true);

  function markRoomReturn(){
    if(!roomAway || !appVisible()) return;
    roomAway=false;
    suppressAuthUntil=Date.now()+8000;
  }

  root.addEventListener('pageshow',markRoomReturn,true);
  root.document.addEventListener('visibilitychange',()=>{
    if(!root.document.hidden) markRoomReturn();
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
    wrapBootAuth();
    if(!installProductLogic()){
      const timer=setInterval(()=>{if(installProductLogic()) clearInterval(timer);},50);
      setTimeout(()=>clearInterval(timer),5000);
    }
    refreshRankingNote();
    const observer=new MutationObserver(refreshRankingNote);
    observer.observe(root.document.body,{childList:true,subtree:true});
  },{once:true});
})(typeof window==='undefined'?null:window);
