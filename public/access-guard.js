(() => {
  const HANDOFF_KEY='urenavi_handoff_pending_v1';
  let deviceAllowed=false;
  let deviceEmail='';
  let handoffTimer=null;
  let handoffPollGeneration=0;

  function addPurchaseLink(){
    if(document.getElementById('urenaviPurchaseLink')) return;
    const loginBtn=document.getElementById('loginBtn');
    if(!loginBtn) return;
    const a=document.createElement('div');
    a.id='urenaviPurchaseLink';
    a.textContent='新規受付・販売は現在準備中です。';
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
      const r=await authDeadline(fetch('/api/access?action=status',{cache:'no-store',credentials:'include'}),10000);
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
    let result;
    try { result=await authDeadline(originalGetSession(...args),8000); }
    catch(error) {
      if(await refreshDeviceAccess()) return {data:{session:{access_token:'device-cookie',user:{email:deviceEmail,last_sign_in_at:new Date().toISOString()}}},error:null};
      throw error;
    }
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

  function startHandoffPolling(restart=false){
    if(handoffTimer&&!restart) return;
    if(handoffTimer) clearTimeout(handoffTimer);
    handoffTimer=null;
    const generation=++handoffPollGeneration;
    const code=localStorage.getItem(HANDOFF_KEY)||'';
    if(!/^[a-f0-9]{64}$/i.test(code)) return;
    const started=Date.now();
    const poll=async()=>{
      if(generation!==handoffPollGeneration) return;
      try{
        const r=await fetch('/api/access?action=handoff-status&code='+encodeURIComponent(code),{cache:'no-store',credentials:'include'});
        if(generation!==handoffPollGeneration) return;
        if(r.status===200){
          const d=await r.json().catch(()=>({}));
          if(generation!==handoffPollGeneration) return;
          deviceAllowed=true;
          deviceEmail=String(d.email||'');
          localStorage.removeItem(HANDOFF_KEY);
          handoffTimer=null;
          if(typeof bootAuth==='function') setTimeout(()=>{void bootAuth();},0);
          return;
        }
        if(r.status===410){localStorage.removeItem(HANDOFF_KEY);handoffTimer=null;return;}
      }catch{}
      if(generation!==handoffPollGeneration) return;
      if(Date.now()-started<10*60*1000){handoffTimer=setTimeout(poll,1800);}else{localStorage.removeItem(HANDOFF_KEY);handoffTimer=null;}
    };
    handoffTimer=setTimeout(poll,600);
  }

  const logoutBtn=document.getElementById('logoutBtn');
  if(logoutBtn){
    logoutBtn.onclick=async()=>{
      accessGeneration++;
      try{UrenaviReturnState.clear(sessionStorage);}catch{}
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

  async function installPreviewOwnerAccess(){
    try{
      const envRes=await fetch('/api/runtime-env',{credentials:'same-origin',cache:'no-store'});
      const env=await envRes.json().catch(()=>({}));
      if(!envRes.ok || env.preview!==true) return;
    }catch{return;}

    const loginBtn=document.getElementById('loginBtn');
    if(!loginBtn || document.getElementById('previewOwnerAccess')) return;

    const incoming=new URLSearchParams(window.location.search).getAll('handoff');
    if(incoming.length===1&&/^[a-f0-9]{64}$/i.test(incoming[0])){
      const hint=document.createElement('div');
      hint.id='previewOwnerAccess';
      hint.textContent='端末接続の承認画面です。この画面にログイン表示が出ない場合は、同じリンクを、さきほどウレナビにログインしたブラウザで開いてください。ブラウザ間でログイン状態は共有されません。';
      Object.assign(hint.style,{marginTop:'12px',padding:'12px',border:'1px solid #bfd3ee',borderRadius:'13px',background:'#f3f8ff',lineHeight:'1.6'});
      loginBtn.insertAdjacentElement('afterend',hint);
      return;
    }

    const box=document.createElement('div');
    box.id='previewOwnerAccess';
    Object.assign(box.style,{
      marginTop:'12px',
      padding:'12px',
      border:'1px solid #bfd3ee',
      borderRadius:'13px',
      background:'#f3f8ff',
      color:'#294466',
      fontSize:'12px',
      lineHeight:'1.6'
    });

    const title=document.createElement('strong');
    title.textContent='Preview確認用（オーナーのみ）';

    const note=document.createElement('div');
    note.textContent='ログイン済みの端末で承認すると、メールを再送せずにこの検証画面へ入れます。';

    function approvalButton(label,origin,preview){
      const button=document.createElement('button');
      button.type='button';
      button.textContent=label;
      Object.assign(button.style,{
      display:'block',
      width:'100%',
      marginTop:'9px',
      padding:'12px',
      border:'0',
      borderRadius:'10px',
      background:'#172a4b',
      color:'#fff',
      fontWeight:'900'
      });
      button.addEventListener('click',()=>prepareApproval(origin,preview));
      return button;
    }

    const msg=document.createElement('div');
    msg.style.marginTop='8px';

    function prepareApproval(origin,preview){
      const code=randomHandoff();
      localStorage.setItem(HANDOFF_KEY,code);
      startHandoffPolling(true);

      // The app can recover its Supabase session and send the bearer token.
      // Direct API navigation has only cookies and cannot read that session.
      // Keep the existing production route, whose app is not changed here.
      const approveUrl=origin+(preview?'/app.html?handoff=':'/api/access?action=handoff-approve&code=')+encodeURIComponent(code);
      // A normal link does not depend on popup permission or window.open's
      // null return value with noopener. The existing approval/polling guards remain.
      msg.replaceChildren();
      const explanation=document.createElement('div');
      explanation.textContent=preview?'下のリンクを、この開発版にログイン済みのブラウザで開いて承認してください。ログインし直す必要はありません。':'下のリンクを、本番ウレナビにログイン済みのブラウザで開いてください。認証確認後、このPreviewへ戻ります。';
      const approvalLink=document.createElement('a');
      approvalLink.href=approveUrl;
      approvalLink.target='_blank';
      approvalLink.rel='noopener noreferrer';
      approvalLink.textContent=preview?'ログイン済みの開発版で承認する':'本番で認証を確認する';
      Object.assign(approvalLink.style,{display:'block',padding:'12px',marginTop:'8px',textAlign:'center',fontWeight:'900'});
      msg.append(explanation,approvalLink);
      if(typeof QRCode==='function'){
        const qrLabel=document.createElement('div');
        qrLabel.textContent='スマホで認証するためのQRコード（10分以内）';
        const qr=document.createElement('div');
        qr.id='previewOwnerQr';
        qr.setAttribute('aria-label','Preview認証用QRコード');
        Object.assign(qr.style,{padding:'16px',background:'#fff',width:'256px',margin:'12px auto'});
        msg.append(qrLabel,qr);
        new QRCode(qr,{text:approveUrl,width:256,height:256,correctLevel:QRCode.CorrectLevel.M});
      }
    }

    const previewBtn=approvalButton('この開発版のログインで承認',window.location.origin,true);
    const btn=approvalButton('本番の認証でPreviewを開く','https://rakuten-affiliate-ai-mobile.vercel.app',false);
    box.append(title,note,previewBtn,btn,msg);
    loginBtn.insertAdjacentElement('afterend',box);
  }

  function installRoomPostCopyFix(){
    if(typeof post!=='function') return;
    const basePost=post;
    window.post=(item,platform='room')=>{
      let body=basePost(item,platform);
      body=body.replace(/^※アフィリエイト広告を利用しています\n\n/,'');
      body=body.replace(/^PR｜[^\n]+\n\n/,'');

      if(platform==='room'){
        body=body.replace(
          /\n\n気になる方はこちら👇\nhttps:\/\/[^\s]+\s*$/,
          '\n\n気になる方は商品画像をタップしてチェック👇'
        );
      }

      body=body.replace(/\s*※アフィリエイト広告を利用しています\s*$/,'').trim();
      return body+'\n\n※アフィリエイト広告を利用しています';
    };
  }

  function installSafePostPreviewLinks(){
    const urlRe=/(https:\/\/[^\s<]+)/g;

    function makeClickable(el){
      if(!el) return;
      const text=el.textContent||'';
      const parts=text.split(urlRe);
      if(parts.length<2) return;
      const frag=document.createDocumentFragment();
      for(const part of parts){
        if(/^https:\/\//.test(part)){
          const a=document.createElement('a');
          a.href=part;
          a.target='_blank';
          a.rel='noopener noreferrer';
          a.textContent=part;
          a.style.color='#0a66c2';
          a.style.textDecoration='underline';
          a.style.fontWeight='700';
          a.style.overflowWrap='anywhere';
          frag.appendChild(a);
        }else{
          frag.appendChild(document.createTextNode(part));
        }
      }
      el.replaceChildren(frag);
    }

    function enhanceVisiblePreviews(root=document){
      root.querySelectorAll?.('.copy').forEach(makeClickable);
    }

    if(typeof render==='function'){
      const baseRender=render;
      window.render=(...args)=>{
        const result=baseRender(...args);
        enhanceVisiblePreviews(document.getElementById('res')||document);
        return result;
      };
    }

    document.addEventListener('click',e=>{
      const tab=e.target.closest?.('.tab');
      if(!tab) return;
      const item=tab.closest('.item');
      if(item) makeClickable(item.querySelector('.copy'));
    });
  }

  function installPriceLayout(){
    const minSelect=document.getElementById('min');
    const maxSelect=document.getElementById('max');
    if(!minSelect || !maxSelect || document.getElementById('urenaviPriceRow')) return;
    const minLabel=minSelect.previousElementSibling;
    const maxLabel=maxSelect.previousElementSibling;
    if(!minLabel || !maxLabel || minLabel.tagName!=='LABEL' || maxLabel.tagName!=='LABEL') return;
    const row=document.createElement('div');
    row.id='urenaviPriceRow';
    row.style.display='grid';
    row.style.gridTemplateColumns='1fr 1fr';
    row.style.gap='10px';
    row.style.alignItems='end';
    const minCol=document.createElement('div');
    const maxCol=document.createElement('div');
    minLabel.parentNode.insertBefore(row,minLabel);
    minCol.appendChild(minLabel);
    minCol.appendChild(minSelect);
    maxCol.appendChild(maxLabel);
    maxCol.appendChild(maxSelect);
    row.appendChild(minCol);
    row.appendChild(maxCol);
  }

  function installCompactHistory(){
    const histEl=document.getElementById('hist');
    if(!histEl || typeof hist!=='function' || typeof closeH!=='function') return;
    Object.assign(histEl.style,{position:'static',left:'auto',right:'auto',top:'auto',marginTop:'6px',zIndex:'auto',boxShadow:'none'});
    let expanded=false;
    window.drawH=()=>{
      const h=hist();
      const visible=expanded?h:h.slice(0,3);
      histEl.innerHTML=h.length
        ?`<div class="hh"><span>最近の検索</span><button class="hc">履歴を消す</button></div>${visible.map((v,i)=>`<button class="ho" data-i="${i}">${esc(v.k)}<small>${v.min?fmt(v.min)+'円〜':'下限なし'} / ${v.max?'〜'+fmt(v.max)+'円':'上限なし'}</small></button>`).join('')}${h.length>3?`<button id="historyToggle" type="button" style="display:block;width:100%;border:0;border-top:1px solid #eee;background:#fafafa;padding:10px;font-size:12px;font-weight:800;color:#555">${expanded?'閉じる':'履歴をもっと見る'}</button>`:''}`
        :'<div class="hh">まだ履歴はありません</div>';
      histEl.querySelector('.hc')?.addEventListener('click',e=>{e.stopPropagation();localStorage.removeItem('raiHistory3');expanded=false;drawH();});
      histEl.querySelectorAll('.ho').forEach((b,i)=>{
        b.onclick=e=>{e.stopPropagation();const v=visible[i];if(!v)return;k.value=v.k;x.classList.add('on');document.getElementById('min').value=v.min;document.getElementById('max').value=v.max;document.getElementById('sort').value=v.sort;closeH();};
      });
      histEl.querySelector('#historyToggle')?.addEventListener('click',e=>{e.stopPropagation();expanded=!expanded;drawH();histEl.classList.add('on');});
    };
  }

  installRoomPostCopyFix();
  installSafePostPreviewLinks();
  installPriceLayout();
  installCompactHistory();
  addPurchaseLink();
  void installPreviewOwnerAccess();
  applyActivationMessage();
  startHandoffPolling();

  originalGetSession().then(({data})=>{if(data?.session) return approveHandoffIfPresent(data.session);}).catch(()=>{});
  refreshDeviceAccess().then(ok=>{if(ok && typeof bootAuth==='function') setTimeout(()=>{void bootAuth();},0);});
})();
