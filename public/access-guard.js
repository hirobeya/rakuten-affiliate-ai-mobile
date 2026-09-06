(() => {
  const PURCHASE_URL='/api/access?action=buy';
  const HANDOFF_KEY='urenavi_handoff_pending_v1';
  let deviceAllowed=false;
  let deviceEmail='';
  let handoffTimer=null;

  function addPurchaseLink(){
    if(document.getElementById('urenaviPurchaseLink')) return;
    const loginBtn=document.getElementById('loginBtn');
    if(!loginBtn) return;
    const a=document.createElement('a');
    a.id='urenaviPurchaseLink';
    a.href=PURCHASE_URL;
    a.textContent='まだ購入していない方｜月額980円で始める';
    Object.assign(a.style,{display:'block',marginTop:'12px',padding:'13px',border:'1px solid #e8b6ad',borderRadius:'13px',textAlign:'center',textDecoration:'none',color:'#a12e21',fontSize:'12px',fontWeight:'900',background:'#fff8f6'});
    loginBtn.insertAdjacentElement('afterend',a);
  }

  function applyActivationMessage(){
    const q=new URLSearchParams(window.location.search);
    if(q.get('activated')!=='1') return;
    const msg=document.getElementById('authMsg');
    if(msg){
      msg.textContent='購入登録が完了しました。この端末では次回からメール入力なしで開けます。';
      msg.className='authMsg ok';
    }
  }

  async function refreshDeviceAccess(){
    try{
      const r=await fetch('/api/access?action=status',{cache:'no-store',credentials:'include'});
      if(!r.ok){deviceAllowed=false;deviceEmail='';return false;}
      const d=await r.json().catch(()=>({}));
      deviceAllowed=true;
      deviceEmail=String(d.email||'');
      return true;
    }catch{
      deviceAllowed=false;
      deviceEmail='';
      return false;
    }
  }

  function randomHandoff(){
    const bytes=new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  }

  const originalSignInWithOtp=sb.auth.signInWithOtp.bind(sb.auth);
  sb.auth.signInWithOtp=async payload=>{
    const code=randomHandoff();
    localStorage.setItem(HANDOFF_KEY,code);
    const redirect=new URL(window.location.origin+'/app.html');
    redirect.searchParams.set('handoff',code);
    const next={...payload,options:{...(payload?.options||{}),emailRedirectTo:redirect.toString()}};
    const result=await originalSignInWithOtp(next);
    if(result?.error){localStorage.removeItem(HANDOFF_KEY);}
    else startHandoffPolling();
    return result;
  };

  const originalGetSession=sb.auth.getSession.bind(sb.auth);
  sb.auth.getSession=async(...args)=>{
    const result=await originalGetSession(...args);
    if(result?.data?.session) return result;
    if(!deviceAllowed) await refreshDeviceAccess();
    if(deviceAllowed){
      return {data:{session:{access_token:'device-cookie',user:{email:deviceEmail,last_sign_in_at:new Date().toISOString()}}},error:null};
    }
    return result;
  };

  async function approveHandoffIfPresent(session){
    const code=new URLSearchParams(window.location.search).get('handoff')||'';
    if(!/^[a-f0-9]{64}$/i.test(code) || !session?.access_token || session.access_token==='device-cookie') return false;
    try{
      const r=await fetch('/api/access?action=handoff-approve&code='+encodeURIComponent(code),{
        cache:'no-store',credentials:'include',headers:{Authorization:`Bearer ${session.access_token}`}
      });
      if(!r.ok) return false;
      history.replaceState({},document.title,window.location.pathname);
      const msg=document.getElementById('authMsg');
      if(msg){msg.textContent='ログインを確認しました。元のウレナビ画面に戻ってください。';msg.className='authMsg ok';}
      return true;
    }catch{return false;}
  }

  function startHandoffPolling(){
    if(handoffTimer) return;
    const code=localStorage.getItem(HANDOFF_KEY)||'';
    if(!/^[a-f0-9]{64}$/i.test(code)) return;
    const started=Date.now();
    const poll=async()=>{
      try{
        const r=await fetch('/api/access?action=handoff-status&code='+encodeURIComponent(code),{cache:'no-store',credentials:'include'});
        if(r.status===200){
          const d=await r.json().catch(()=>({}));
          deviceAllowed=true;
          deviceEmail=String(d.email||'');
          localStorage.removeItem(HANDOFF_KEY);
          handoffTimer=null;
          if(typeof bootAuth==='function') setTimeout(()=>{void bootAuth();},0);
          return;
        }
        if(r.status===410){localStorage.removeItem(HANDOFF_KEY);handoffTimer=null;return;}
      }catch{}
      if(Date.now()-started<10*60*1000){handoffTimer=setTimeout(poll,1800);}else{localStorage.removeItem(HANDOFF_KEY);handoffTimer=null;}
    };
    handoffTimer=setTimeout(poll,600);
  }

  const logoutBtn=document.getElementById('logoutBtn');
  if(logoutBtn){
    logoutBtn.onclick=async()=>{
      try{await fetch('/api/access?action=logout',{cache:'no-store',credentials:'include'});}catch{}
      deviceAllowed=false;
      deviceEmail='';
      localStorage.removeItem(HANDOFF_KEY);
      try{await sb.auth.signOut({scope:'local'});}catch{}
      if(typeof showLogin==='function') showLogin();
    };
  }

  sb.auth.onAuthStateChange((event,session)=>{
    if(session && (event==='SIGNED_IN'||event==='INITIAL_SESSION'||event==='TOKEN_REFRESHED')){
      setTimeout(()=>{void approveHandoffIfPresent(session);},0);
    }
  });

  addPurchaseLink();
  applyActivationMessage();
  startHandoffPolling();

  originalGetSession().then(({data})=>{if(data?.session) return approveHandoffIfPresent(data.session);}).catch(()=>{});
  refreshDeviceAccess().then(ok=>{if(ok && typeof bootAuth==='function') setTimeout(()=>{void bootAuth();},0);});
})();
