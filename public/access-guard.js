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

  function installRoomPostCopyFix(){
    if(typeof post!=='function') return;
    const basePost=post;
    window.post=(item,platform='room')=>{
      const text=basePost(item,platform);
      if(platform!=='room') return text;
      return text.replace(/\n\n気になる方はこちら👇\nhttps:\/\/[^\s]+\s*$/,'\n\n気になる方は商品画像をタップしてチェック👇');
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
      window.render=a=>{
        baseRender(a);
        enhanceVisiblePreviews(document.getElementById('res')||document);
      };
    }
    document.addEventListener('click',e=>{
      const tab=e.target.closest?.('.tab');
      if(!tab) return;
      const item=tab.closest('.item');
      if(item) makeClickable(item.querySelector('.copy'));
    });
  }

  function installReturnVisibilityFix(){
    if(typeof showApp!=='function' || typeof bootAuth!=='function') return;
    showApp=async session=>{
      const generation=++accessGeneration;
      const wasVisible=getComputedStyle(appRoot).display!=='none';
      let timeoutId=null;
      let controller=null;
      try{
        controller=new AbortController();
        timeoutId=setTimeout(()=>controller.abort(),10000);
        const response=await fetch('/api/access?action=status',{
          headers:{Authorization:`Bearer ${session.access_token}`},
          cache:'no-store',
          credentials:'include',
          signal:controller.signal
        });
        if(generation!==accessGeneration) return;
        if(response.status===403){
          showLogin('有効な購入情報がありません。購入時のメールアドレスでログインしてください。','err');
          return;
        }
        if(!response.ok){
          if(wasVisible){
            console.warn('Access recheck failed while app is visible:',response.status);
            return;
          }
          showLogin('ログイン情報を確認できません。再認証または再試行してください。','err');
          return;
        }
        authGate.style.display='none';
        appRoot.style.display='block';
        userMail.textContent=session?.user?.email||'';
      }catch(error){
        if(generation!==accessGeneration) return;
        if(wasVisible){
          console.warn('Access recheck skipped to keep current screen visible.',error);
          appRoot.style.display='block';
          authGate.style.display='none';
          return;
        }
        showLogin('通信状態を確認し、もう一度お試しください。','err');
      }finally{
        if(timeoutId) clearTimeout(timeoutId);
      }
    };
    window.addEventListener('pageshow',()=>{
      if(document.visibilityState!=='hidden') setTimeout(()=>{void bootAuth();},0);
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
      histEl.querySelector('.hc')?.addEventListener('click',e=>{
        e.stopPropagation();
        localStorage.removeItem('raiHistory3');
        expanded=false;
        drawH();
      });
      histEl.querySelectorAll('.ho').forEach((b,i)=>{
        b.onclick=e=>{
          e.stopPropagation();
          const v=visible[i];
          if(!v) return;
          k.value=v.k;
          x.classList.add('on');
          document.getElementById('min').value=v.min;
          document.getElementById('max').value=v.max;
          document.getElementById('sort').value=v.sort;
          closeH();
        };
      });
      histEl.querySelector('#historyToggle')?.addEventListener('click',e=>{
        e.stopPropagation();
        expanded=!expanded;
        drawH();
        histEl.classList.add('on');
      });
    };
  }

  function installRoomPostFlow(){
    if(typeof render!=='function') return;
    const baseRender=render;
    window.render=a=>{
      baseRender(a);
      const root=document.getElementById('res');
      if(!root) return;
      root.querySelectorAll('.item').forEach((item,index)=>{
        const actions=item.querySelector('.acts');
        const link=actions?.querySelector('a');
        const data=a?.[index];
        if(!actions || !link || !data) return;
        const roomUrl=safeUrl(data.itemUrl||data.affiliateUrl);
        link.href=roomUrl;
        link.textContent='楽天の商品ページを開く';
        link.setAttribute('aria-label','楽天の商品ページを開いてROOMに投稿');
        if(!item.querySelector('.room-flow-note')){
          const note=document.createElement('div');
          note.className='room-flow-note';
          note.textContent='① 投稿文をコピー → ② 楽天の商品ページを開く → ③ 共有から「ROOMに投稿」をタップ';
          Object.assign(note.style,{marginTop:'7px',fontSize:'10px',lineHeight:'1.5',color:'#777',textAlign:'center'});
          actions.insertAdjacentElement('afterend',note);
        }
      });
      const todayLink=root.querySelector('.today .btns a');
      if(todayLink && Array.isArray(a) && a.length){
        const top=[...a].sort((x,y)=>(y.sellability||0)-(x.sellability||0)||(y.score||0)-(x.score||0))[0];
        todayLink.href=safeUrl(top.itemUrl||top.affiliateUrl);
        todayLink.textContent='楽天の商品ページを開く';
      }
    };
  }

  installScoreCopyFix();
  installRoomPostCopyFix();
  installSafePostPreviewLinks();
  installReturnVisibilityFix();
  installPriceLayout();
  installCompactHistory();
  installRoomPostFlow();
  addPurchaseLink();
  applyActivationMessage();
  startHandoffPolling();

  originalGetSession().then(({data})=>{if(data?.session) return approveHandoffIfPresent(data.session);}).catch(()=>{});
  refreshDeviceAccess().then(ok=>{if(ok && typeof bootAuth==='function') setTimeout(()=>{void bootAuth();},0);});
})();