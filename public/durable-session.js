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

  function applyResumeUI(){
    // Search persistence remains available, but it must never infer a ROOM post
    // or add a next-product control that navigates to another Rakuten page.
    root.document.getElementById('durableResumeBox')?.remove();
    root.document.querySelectorAll('.durableFinishNext,.durableStatus').forEach(node=>node.remove());
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

  function start(){
    wrapRender();
    void waitForApp();
  }

  root.addEventListener('click',event=>{
    const link=event.target.closest?.('a');
    if(!link || link.dataset.urenaviProductLink!=='market') return;
    if(!safeUrl(link.href||'')) return;
    // Preserve native target=_blank behavior: never replace the Urenavi tab.
    try{if(typeof root.saveSearchState==='function') root.saveSearchState();}catch{}
    const index=linkIndex(link);
    void (async()=>{
      try{await syncPromise;}catch{}
      try{if(!currentSession) await loadActive();}catch{}
      if(index>=0)try{await markProcessing(index);}catch{}
    })();
  },true);

  root.document.addEventListener('click',event=>{
    if(!event.target.closest?.('.tab[data-p]')) return;
    setTimeout(()=>{void savePlatforms();},0);
  },true);

  root.addEventListener('pageshow',()=>{void waitForApp();},true);
  root.document.addEventListener('visibilitychange',()=>{if(!root.document.hidden) void waitForApp();},true);
  if(root.document.readyState==='loading'){
    root.addEventListener('DOMContentLoaded',start,{once:true});
  }else{
    start();
  }

  root.UrenaviDurable={restoreActive,loadActive,start};
})(typeof window==='undefined'?null:window);
