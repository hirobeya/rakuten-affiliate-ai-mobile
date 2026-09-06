(() => {
  const PURCHASE_URL='/api/access?action=buy';
  let deviceAllowed=false;
  let deviceEmail='';

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

  const originalLogout=document.getElementById('logoutBtn')?.onclick;
  const logoutBtn=document.getElementById('logoutBtn');
  if(logoutBtn){
    logoutBtn.onclick=async()=>{
      try{await fetch('/api/access?action=logout',{cache:'no-store',credentials:'include'});}catch{}
      deviceAllowed=false;
      deviceEmail='';
      try{await sb.auth.signOut({scope:'local'});}catch{}
      if(typeof showLogin==='function') showLogin();
      if(originalLogout && originalLogout!==logoutBtn.onclick){/* original intentionally replaced */}
    };
  }

  addPurchaseLink();
  applyActivationMessage();

  refreshDeviceAccess().then(ok=>{
    if(ok && typeof bootAuth==='function') setTimeout(()=>{void bootAuth();},0);
  });
})();
