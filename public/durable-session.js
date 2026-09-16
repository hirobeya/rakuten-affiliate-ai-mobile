(function(root){
  if(!root || !root.document || root.__urenaviDurableInstalled) return;
  root.__urenaviDurableInstalled=true;

  const TABLE='urenavi_search_sessions';
  const STATUS_PENDING='pending';
  const STATUS_PROCESSING='processing';
  const STATUS_POSTED='posted';
  const DB_TIMEOUT_MS=2200;

  let currentSession=null;
  let restoring=false;
  let syncPromise=Promise.resolve();
  let wrapped=false;

  function client(){
    try{return typeof sb!=='undefined' ? sb : null;}catch{return null;}
  }

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

  function statusMapFor(items,existing={}){
    const next={};
    for(const item of items||[]){
      const key=itemKey(item);
      const status=existing?.[key];
      next[key]=[STATUS_PENDING,STATUS_PROCESSING,STATUS_POSTED].includes(status)?status:STATUS_PENDING;
    }
    return next;
  }

  function signature(items,searchFields){
    return JSON.stringify({
      k:String(searchFields?.k||''),
      min:String(searchFields?.min||''),
      max:String(searchFields?.max||''),
      sort:String(searchFields?.sort||''),
      keys:(items||[]).map(itemKey)
    });
  }

  function withTimeout(promise,ms=DB_TIMEOUT_MS){
    let timer;
    return Promise.race([
      promise,
      new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('durable session timeout')),ms);})
    ]).finally(()=>clearTimeout(timer));
  }

  async function authSession(){
    const c=client();
    if(!c) return null;
    try{
      const {data,error}=await c.auth.getSession();
      if(error) return null;
      return data?.session||null;
    }catch{return null;}
  }

  async function loadActive(){
    const c=client();
    const auth=await authSession();
    if(!c || !auth?.user?.id) return null;
    try{
      const {data,error}=await c.from(TABLE)
        .select('*')
        .eq('user_id',auth.user.id)
        .eq('status','active')
        .order('updated_at',{ascending:false})
        .limit(1)
        .maybeSingle();
      if(error) throw error;
      currentSession=data||null;
      return currentSession;
    }catch(e){
      console.warn('Urenavi durable load failed',e);
      return null;
    }
  }

  async function persistRendered(items){
    if(restoring || !Array.isArray(items) || !items.length) return currentSession;
    const c=client();
    const auth=await authSession();
    if(!c || !auth?.user?.id) return null;

    const searchFields=fields();
    let active=currentSession;
    if(!active) active=await loadActive();

    const same=active && signature(active.items,active.search_fields)===signature(items,searchFields);
    const now=new Date().toISOString();

    try{
      if(same){
        const payload={
          items,
          search_fields:searchFields,
          item_statuses:statusMapFor(items,active.item_statuses||{}),
          platforms:platforms(),
          updated_at:now
        };
        const {data,error}=await c.from(TABLE).update(payload).eq('id',active.id).select('*').single();
        if(error) throw error;
        currentSession=data;
      }else{
        if(active?.id){
          await c.from(TABLE).update({status:'completed',updated_at:now}).eq('id',active.id);
        }
        const payload={
          user_id:auth.user.id,
          status:'active',
          search_fields:searchFields,
          items,
          item_statuses:statusMapFor(items,{}),
          platforms:platforms(),
          current_index:0,
          updated_at:now
        };
        const {data,error}=await c.from(TABLE).insert(payload).select('*').single();
        if(error) throw error;
        currentSession=data;
      }
      applyResumeUI();
      return currentSession;
    }catch(e){
      console.warn('Urenavi durable save failed',e);
      return null;
    }
  }

  function findItemIndexByLink(link){
    if(!currentSession?.items?.length) return -1;
    const href=safeUrl(link?.href||'');
    if(!href) return -1;
    return currentSession.items.findIndex(item=>safeUrl(item?.affiliateUrl||item?.itemUrl||'')===href);
  }

  async function updateSession(patch){
    if(!currentSession?.id) return false;
    const c=client();
    if(!c) return false;
    try{
      const payload={...patch,updated_at:new Date().toISOString()};
      const {data,error}=await c.from(TABLE).update(payload).eq('id',currentSession.id).select('*').single();
      if(error) throw error;
      currentSession=data;
      applyResumeUI();
      return true;
    }catch(e){
      console.warn('Urenavi durable update failed',e);
      return false;
    }
  }

  async function markProcessing(index){
    if(!currentSession?.items?.[index]) return false;
    const statuses=statusMapFor(currentSession.items,currentSession.item_statuses||{});
    const key=itemKey(currentSession.items[index]);
    statuses[key]=STATUS_PROCESSING;
    return updateSession({item_statuses:statuses,current_index:index,platforms:platforms()});
  }

  async function markPosted(index){
    if(!currentSession?.items?.[index]) return false;
    const statuses=statusMapFor(currentSession.items,currentSession.item_statuses||{});
    statuses[itemKey(currentSession.items[index])]=STATUS_POSTED;
    return updateSession({item_statuses:statuses,current_index:index,platforms:platforms()});
  }

  function firstIndex(status){
    if(!currentSession?.items?.length) return -1;
    const statuses=statusMapFor(currentSession.items,currentSession.item_statuses||{});
    return currentSession.items.findIndex(item=>statuses[itemKey(item)]===status);
  }

  function nextPendingIndex(after=-1){
    if(!currentSession?.items?.length) return -1;
    const statuses=statusMapFor(currentSession.items,currentSession.item_statuses||{});
    for(let i=Math.max(0,after+1);i<currentSession.items.length;i++){
      if(statuses[itemKey(currentSession.items[i])]===STATUS_PENDING) return i;
    }
    for(let i=0;i<=after && i<currentSession.items.length;i++){
      if(statuses[itemKey(currentSession.items[i])]===STATUS_PENDING) return i;
    }
    return -1;
  }

  async function finishCurrentAndOpenNext(){
    if(!currentSession?.items?.length) return;
    let processing=firstIndex(STATUS_PROCESSING);
    if(processing>=0) await markPosted(processing);
    const next=nextPendingIndex(processing);
    if(next<0){
      await updateSession({status:'completed'});
      const st=root.document.getElementById('st');
      if(st) st.textContent='この検索セッションの商品はすべて投稿済みです。';
      return;
    }
    await markProcessing(next);
    try{if(typeof root.saveSearchState==='function') root.saveSearchState();}catch{}
    const url=safeUrl(currentSession.items[next]?.affiliateUrl||currentSession.items[next]?.itemUrl||'');
    if(url) root.location.assign(url);
  }

  function makeBadge(status){
    const badge=root.document.createElement('span');
    badge.className='durableStatus';
    const cfg=status===STATUS_POSTED
      ?['✓ 投稿済み','#eaf7ee','#216e39']
      :status===STATUS_PROCESSING
      ?['処理中','#fff4df','#8a5b00']
      :['未処理','#eef1f4','#666'];
    badge.textContent=cfg[0];
    badge.style.cssText=`display:inline-block;margin-left:6px;padding:3px 7px;border-radius:999px;background:${cfg[1]};color:${cfg[2]};font-size:10px;font-weight:900;vertical-align:middle;`;
    return badge;
  }

  function applyItemStatuses(){
    if(!currentSession?.items?.length) return;
    const statuses=statusMapFor(currentSession.items,currentSession.item_statuses||{});
    root.document.querySelectorAll('.item').forEach((card,index)=>{
      card.querySelector('.durableStatus')?.remove();
      card.querySelector('.durableFinishNext')?.remove();
      const item=currentSession.items[index];
      if(!item) return;
      const status=statuses[itemKey(item)];
      const rank=card.querySelector('.rank');
      if(rank) rank.appendChild(makeBadge(status));
      if(status===STATUS_PROCESSING){
        const button=root.document.createElement('button');
        button.type='button';
        button.className='durableFinishNext';
        button.textContent='投稿済みにして次の商品へ';
        button.style.cssText='width:100%;margin-top:9px;padding:11px;border:0;border-radius:10px;background:#172a4b;color:white;font-size:12px;font-weight:900;';
        button.addEventListener('click',()=>{void finishCurrentAndOpenNext();});
        (card.querySelector('.acts')||card).insertAdjacentElement('afterend',button);
      }
    });
  }

  function applyResumeUI(){
    if(!currentSession?.items?.length) return;
    const res=root.document.getElementById('res');
    if(!res) return;
    root.document.getElementById('durableResumeBox')?.remove();
    const statuses=statusMapFor(currentSession.items,currentSession.item_statuses||{});
    const values=currentSession.items.map(item=>statuses[itemKey(item)]);
    const posted=values.filter(v=>v===STATUS_POSTED).length;
    const processing=values.filter(v=>v===STATUS_PROCESSING).length;
    const remaining=values.filter(v=>v===STATUS_PENDING).length;

    const box=root.document.createElement('section');
    box.id='durableResumeBox';
    box.style.cssText='background:#eef5ff;border:1px solid #cbdcf3;border-radius:16px;padding:13px;margin-top:12px;';
    const title=root.document.createElement('div');
    title.textContent='続きから再開';
    title.style.cssText='font-size:15px;font-weight:900;color:#172a4b;';
    const meta=root.document.createElement('div');
    meta.textContent=`投稿済み ${posted}件 / 処理中 ${processing}件 / 未処理 ${remaining}件`;
    meta.style.cssText='margin-top:4px;font-size:11px;color:#52606d;';
    const button=root.document.createElement('button');
    button.type='button';
    button.textContent=processing>0?'投稿済みにして次の商品へ':remaining>0?'次の商品へ':'この検索は完了しています';
    button.disabled=remaining===0 && processing===0;
    button.style.cssText='width:100%;margin-top:10px;padding:12px;border:0;border-radius:11px;background:#172a4b;color:white;font-size:13px;font-weight:900;';
    button.addEventListener('click',()=>{void finishCurrentAndOpenNext();});
    box.append(title,meta,button);
    res.insertAdjacentElement('afterbegin',box);
    applyItemStatuses();
  }

  async function restoreActive(){
    const app=root.document.getElementById('appRoot');
    if(!app || app.style.display!=='block' || typeof root.render!=='function') return false;
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
    const x=root.document.getElementById('x');
    if(x) x.classList.toggle('on',!!root.document.getElementById('k')?.value);
    const st=root.document.getElementById('st');
    if(st) st.textContent='保存済みの検索セッションを復元しました。続きから投稿できます。';
    applyResumeUI();
    return true;
  }

  function wrapRender(){
    if(wrapped || typeof root.render!=='function') return false;
    const base=root.render;
    root.render=function(items){
      const result=base.apply(this,arguments);
      if(!restoring && Array.isArray(items) && items.length){
        syncPromise=persistRendered(items);
      }
      return result;
    };
    wrapped=true;
    return true;
  }

  async function waitForAppAndRestore(){
    for(let i=0;i<40;i++){
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
    const index=findItemIndexByLink(link);
    if(index>=0){
      try{await withTimeout(markProcessing(index));}catch{}
    }
    try{if(typeof root.saveSearchState==='function') root.saveSearchState();}catch{}
    root.location.assign(href);
  },true);

  root.document.addEventListener('click',event=>{
    const tab=event.target.closest?.('.tab[data-p]');
    if(!tab || !currentSession?.id) return;
    setTimeout(()=>{
      void updateSession({platforms:platforms()});
    },0);
  },true);

  root.addEventListener('pageshow',()=>{void waitForAppAndRestore();},true);
  root.document.addEventListener('visibilitychange',()=>{
    if(!root.document.hidden) void waitForAppAndRestore();
  },true);
  root.addEventListener('DOMContentLoaded',()=>{
    wrapRender();
    void waitForAppAndRestore();
  },{once:true});

  root.UrenaviDurable={restoreActive,loadActive,finishCurrentAndOpenNext};
})(typeof window==='undefined'?null:window);
