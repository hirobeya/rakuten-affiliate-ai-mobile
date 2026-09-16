(function(root){
  if(!root || !root.document || root.__urenaviDurableInstalled) return;
  root.__urenaviDurableInstalled=true;

  const PENDING='pending';
  const PROCESSING='processing';
  const POSTED='posted';
  const API='/api/resume';
  const DB_TIMEOUT_MS=2600;

  let currentSession=null;
  let restoring=false;
  let syncPromise=Promise.resolve();
  let wrapped=false;
  let restoringNow=false;

  function itemKey(item){
    return String(item?.itemCode || item?.affiliateUrl || item?.itemUrl || `${item?.itemName||''}|${item?.itemPrice||''}`);
  }

  function safeUrl(value){
    try{const u=new URL(value); return u.protocol==='https:'?u.href:'';}catch{return '';}
  }

  function fields(){
    const out={};
    for(const id of ['k','min','max','sort']) out[id]=root.document.getElementById(id)?.value||'';
    return out;
  }

  function platforms(){
    return Array.from(root.document.querySelectorAll('.item')).map(el=>el.querySelector('.tab.on')?.dataset?.p||'room');
  }

  function statuses(items,existing={}){
    const out={};
    for(const item of items||[]){
      const key=itemKey(item);
      const value=existing?.[key];
      out[key]=[PENDING,PROCESSING,POSTED].includes(value)?value:PENDING;
    }
    return out;
  }

  function timeout(promise,ms=DB_TIMEOUT_MS){
    let timer;
    return Promise.race([
      promise,
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('resume timeout')),ms);})
    ]).finally(()=>clearTimeout(timer));
  }

  async function authHeader(){
    try{
      if(typeof sb==='undefined') return {};
      const {data}=await sb.auth.getSession();
      const token=data?.session?.access_token||'';
      return token?{Authorization:`Bearer ${token}`}:{ };
    }catch{return {};}
  }

  async function api(body=null){
    const headers={Accept:'application/json',...(await authHeader())};
    const options={method:body?'POST':'GET',headers,credentials:'include',cache:'no-store'};
    if(body){
      headers['Content-Type']='application/json';
      options.body=JSON.stringify(body);
    }
    const response=await fetch(API,options);
    const data=await response.json().catch(()=>({}));
    if(!response.ok) throw Object.assign(new Error(data.message||'resume request failed'),{status:response.status});
    return data;
  }

  async function loadActive(){
    try{
      const data=await timeout(api());
      currentSession=data?.session||null;
      return currentSession;
    }catch(e){
      if(![401,403].includes(Number(e?.status))) console.warn('Urenavi durable load failed',e);
      return null;
    }
  }

  async function saveRendered(items){
    if(restoring || !Array.isArray(items) || !items.length) return currentSession;
    try{
      const data=await timeout(api({
        action:'save-search',
        search_fields:fields(),
        items,
        platforms:platforms()
      }));
      currentSession=data?.session||null;
      applyResumeUI();
      return currentSession;
    }catch(e){
      console.warn('Urenavi durable save failed',e);
      return null;
    }
  }

  async function markProcessing(index){
    if(!currentSession?.id || !currentSession?.items?.[index]) return false;
    try{
      const data=await timeout(api({
        action:'mark-processing',
        session_id:currentSession.id,
        index,
        platforms:platforms()
      }));
      currentSession=data?.session||currentSession;
      applyResumeUI();
      return true;
    }catch(e){
      console.warn('Urenavi durable processing update failed',e);
      return false;
    }
  }

  async function savePlatforms(){
    if(!currentSession?.id) return;
    try{
      const data=await api({
        action:'save-platforms',
        session_id:currentSession.id,
        platforms:platforms()
      });
      currentSession=data?.session||currentSession;
    }catch(e){
      console.warn('Urenavi durable platform save failed',e);
    }
  }

  function linkIndex(link){
    if(!currentSession?.items?.length) return -1;
    const href=safeUrl(link?.href||'');
    return currentSession.items.findIndex(item=>safeUrl(item?.affiliateUrl||item?.itemUrl||'')===href);
  }

  async function postedNext(){
    if(!currentSession?.id) return;
    try{
      const data=await timeout(api({action:'posted-next',session_id:currentSession.id}),4000);
      currentSession=data?.session||currentSession;
      applyResumeUI();
      const next=data?.next?.item;
      if(!next){
        const st=root.document.getElementById('st');
        if(st) st.textContent='この検索セッションの商品はすべて投稿済みです。';
        return;
      }
      try{if(typeof root.saveSearchState==='function') root.saveSearchState();}catch{}
      const url=safeUrl(next.affiliateUrl||next.itemUrl||'');
      if(url) root.location.assign(url);
    }catch(e){
      console.warn('Urenavi durable next failed',e);
      const st=root.document.getElementById('st');
      if(st) st.textContent='続き情報を更新できませんでした。通信状態を確認してもう一度お試しください。';
    }
  }

  function makeBadge(status){
    const badge=root.document.createElement('span');
    badge.className='durableStatus';
    const cfg=status===POSTED
      ?['✓ 投稿済み','#eaf7ee','#216e39']
      :status===PROCESSING
      ?['処理中','#fff4df','#8a5b00']
      :['未処理','#eef1f4','#666'];
    badge.textContent=cfg[0];
    badge.style.cssText=`display:inline-block;margin-left:6px;padding:3px 7px;border-radius:999px;background:${cfg[1]};color:${cfg[2]};font-size:10px;font-weight:900;vertical-align:middle;`;
    return badge;
  }

  function applyItemStatuses(){
    if(!currentSession?.items?.length) return;
    const map=statuses(currentSession.items,currentSession.item_statuses||{});
    root.document.querySelectorAll('.item').forEach((card,index)=>{
      card.querySelector('.durableStatus')?.remove();
      card.querySelector('.durableFinishNext')?.remove();
      const item=currentSession.items[index];
      if(!item) return;
      const state=map[itemKey(item)];
      card.querySelector('.rank')?.appendChild(makeBadge(state));
      if(state===PROCESSING){
        const button=root.document.createElement('button');
        button.type='button';
        button.className='durableFinishNext';
        button.textContent='投稿済みにして次の商品へ';
        button.style.cssText='width:100%;margin-top:9px;padding:11px;border:0;border-radius:10px;background:#172a4b;color:#fff;font-size:12px;font-weight:900;';
        button.addEventListener('click',()=>{void postedNext();});
        (card.querySelector('.acts')||card).insertAdjacentElement('afterend',button);
      }
    });
  }

  function applyResumeUI(){
    if(!currentSession?.items?.length) return;
    const res=root.document.getElementById('res');
    if(!res) return;
    root.document.getElementById('durableResumeBox')?.remove();
    const map=statuses(currentSession.items,currentSession.item_statuses||{});
    const values=currentSession.items.map(item=>map[itemKey(item)]);
    const posted=values.filter(v=>v===POSTED).length;
    const processing=values.filter(v=>v===PROCESSING).length;
    const pending=values.filter(v=>v===PENDING).length;

    const box=root.document.createElement('section');
    box.id='durableResumeBox';
    box.style.cssText='background:#eef5ff;border:1px solid #cbdcf3;border-radius:16px;padding:13px;margin-top:12px;';
    const title=root.document.createElement('div');
    title.textContent='続きから再開';
    title.style.cssText='font-size:15px;font-weight:900;color:#172a4b;';
    const meta=root.document.createElement('div');
    meta.textContent=`投稿済み ${posted}件 / 処理中 ${processing}件 / 未処理 ${pending}件`;
    meta.style.cssText='margin-top:4px;font-size:11px;color:#52606d;';
    const button=root.document.createElement('button');
    button.type='button';
    button.textContent=processing>0?'投稿済みにして次の商品へ':pending>0?'次の商品へ':'この検索は完了しています';
    button.disabled=pending===0 && processing===0;
    button.style.cssText='width:100%;margin-top:10px;padding:12px;border:0;border-radius:11px;background:#172a4b;color:#fff;font-size:13px;font-weight:900;';
    button.addEventListener('click',()=>{void postedNext();});
    box.append(title,meta,button);
    res.insertAdjacentElement('afterbegin',box);
    applyItemStatuses();
  }

  async function restoreActive(){
    if(restoringNow) return false;
    const app=root.document.getElementById('appRoot');
    if(!app || app.style.display!=='block' || typeof root.render!=='function') return false;
    restoringNow=true;
    try{
      const active=await loadActive();
      if(!active?.items?.length) return false;
      for(const id of ['k','min','max','sort']){
        const el=root.document.getElementById(id);
        if(el) el.value=String(active.search_fields?.[id]||'');
      }
      restoring=true;
      try{root.render(active.items);}finally{restoring=false;}
      root.document.querySelectorAll('.item').forEach((el,i)=>{
        const p=active.platforms?.[i];
        if(['room','threads','instagram'].includes(p)) el.querySelector(`.tab[data-p="${p}"]`)?.click();
      });
      root.document.getElementById('x')?.classList.toggle('on',!!root.document.getElementById('k')?.value);
      const st=root.document.getElementById('st');
      if(st) st.textContent='保存済みの検索セッションを復元しました。続きから投稿できます。';
      applyResumeUI();
      return true;
    }finally{
      restoringNow=false;
    }
  }

  function wrapRender(){
    if(wrapped || typeof root.render!=='function') return false;
    const base=root.render;
    root.render=function(items){
      const result=base.apply(this,arguments);
      if(!restoring && Array.isArray(items) && items.length) syncPromise=saveRendered(items);
      return result;
    };
    wrapped=true;
    return true;
  }

  async function waitForApp(){
    for(let i=0;i<50;i++){
      wrapRender();
      const app=root.document.getElementById('appRoot');
      if(app?.style.display==='block'){
        await restoreActive();
        return;
      }
      await new Promise(r=>setTimeout(r,150));
    }
  }

  root.addEventListener('click',async event=>{
    const link=event.target.closest?.('a');
    if(!link || String(link.textContent||'').trim()!=='楽天で見る') return;
    const href=safeUrl(link.href||'');
    if(!href) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    try{await syncPromise;}catch{}
    if(!currentSession) await loadActive();
    const index=linkIndex(link);
    if(index>=0){
      try{await markProcessing(index);}catch{}
    }
    try{if(typeof root.saveSearchState==='function') root.saveSearchState();}catch{}
    root.location.assign(href);
  },true);

  root.document.addEventListener('click',event=>{
    if(!event.target.closest?.('.tab[data-p]')) return;
    setTimeout(()=>{void savePlatforms();},0);
  },true);

  root.addEventListener('pageshow',()=>{void waitForApp();},true);
  root.document.addEventListener('visibilitychange',()=>{if(!root.document.hidden) void waitForApp();},true);
  root.addEventListener('DOMContentLoaded',()=>{
    wrapRender();
    void waitForApp();
  },{once:true});

  root.UrenaviDurable={restoreActive,loadActive,postedNext};
})(typeof window==='undefined'?null:window);
