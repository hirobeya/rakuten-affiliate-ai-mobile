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

  function installScoreCopyFix(){
    if(typeof pts==='function'){
      const basePts=pts;
      window.pts=i=>{
        const items=basePts(i).filter(text=>!String(text).includes('収益性も確保'));
        const profitability=Number(i?.profitability||0);
        const estimated=Number(i?.estimatedCommission||0);
        if(items.length<3 && estimated>0){
          if(profitability>=65) items.push(`収益性が高く、報酬目安は約${fmt(estimated)}円/件`);
          else if(profitability>=45) items.push(`収益性は標準的。報酬目安は約${fmt(estimated)}円/件`);
          else items.push(`報酬目安は約${fmt(estimated)}円/件`);
        }
        return items.slice(0,3);
      };
    }

    window.decision=a=>{
      const t=(Array.isArray(a)?a:[]).slice(0,3);
      if(!t.length) return '';
      const sell=[...t].sort((x,y)=>(y.sellability||0)-(x.sellability||0))[0];
      const profit=[...t].sort((x,y)=>(y.profitability||0)-(x.profitability||0))[0];
      const overall=t[0];
      const sellRank=t.indexOf(sell)+1;
      const profitRank=t.indexOf(profit)+1;
      return `
<section class="decision">
  <h2>AIの最終結論</h2>
  <div class="dm">迷ったら総合1位。まずは売れやすさを取りにいく。</div>
  <div class="dg">
    <div class="mini"><b>総合</b><span>1位｜AI ${Number(overall.score||0)}/100</span></div>
    <div class="mini"><b>売れやすさ</b><span>${sellRank}位｜${Number(sell.sellability||0)}/100</span></div>
    <div class="mini"><b>利益</b><span>${profitRank}位｜収益性 ${Number(profit.profitability||0)}/100・約${fmt(Number(profit.estimatedCommission||0))}円/件</span></div>
  </div>
</section>`;
    };
  }

  installScoreCopyFix();
  addPurchaseLink();
  applyActivationMessage();
  startHandoffPolling();

  originalGetSession().then(({data})=>{if(data?.session) return approveHandoffIfPresent(data.session);}).catch(()=>{});
  refreshDeviceAccess().then(ok=>{if(ok && typeof bootAuth==='function') setTimeout(()=>{void bootAuth();},0);});
})();
