(()=>{
  const ua=navigator.userAgent||'';
  const isiOS=/iPhone|iPad|iPod/i.test(ua);
  const isAndroid=/Android/i.test(ua);
  const isStandalone=window.matchMedia?.('(display-mode: standalone)')?.matches||navigator.standalone===true;
  const looksInApp=/ChatGPT|FBAN|FBAV|Instagram|Line\//i.test(ua) || (isiOS && !/Safari/i.test(ua)) || (isAndroid && /; wv\)/i.test(ua));
  if(isStandalone || !looksInApp) return;

  const current=location.href;
  const host=location.host;
  const path=location.pathname+location.search+location.hash;

  const wrap=document.createElement('div');
  wrap.id='externalBrowserGate';
  wrap.style.cssText='position:fixed;inset:0;z-index:2147483647;background:#f6f7f9;display:flex;align-items:center;justify-content:center;padding:20px;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Sans","Yu Gothic",sans-serif;color:#171717';
  const card=document.createElement('div');
  card.style.cssText='width:100%;max-width:430px;background:#fff;border-radius:22px;padding:24px 18px;box-shadow:0 12px 36px #00000012;text-align:center';
  card.innerHTML='<div style="font-size:28px;font-weight:900">ウレナビ</div><div style="margin-top:10px;font-size:15px;font-weight:900">ROOM投稿は外部ブラウザで使ってください</div><div style="margin-top:9px;font-size:12px;line-height:1.7;color:#666">アプリ内ブラウザではROOMから戻った時に白画面になることがあります。iPhoneはSafari、AndroidはGoogle Chromeで開いてください。</div>';

  const btn=document.createElement('button');
  btn.type='button';
  btn.style.cssText='width:100%;margin-top:18px;border:0;border-radius:14px;padding:15px;background:#111;color:#fff;font-size:16px;font-weight:900';
  btn.textContent=isiOS?'Safariで開く':'Google Chromeで開く';

  const note=document.createElement('div');
  note.style.cssText='margin-top:10px;font-size:11px;line-height:1.6;color:#888';
  note.textContent=isiOS?'Safariが開かない場合は、画面のメニューから「Safariで開く」を選んでください。':'Chromeが開かない場合は、このURLをコピーしてChromeで開いてください。';

  const copy=document.createElement('button');
  copy.type='button';
  copy.textContent='URLをコピー';
  copy.style.cssText='width:100%;margin-top:10px;border:1px solid #ddd;border-radius:14px;padding:13px;background:#fff;color:#333;font-size:14px;font-weight:800';
  copy.onclick=async()=>{try{await navigator.clipboard.writeText(current);copy.textContent='コピーしました';}catch{prompt('このURLをコピーしてください',current);}};

  btn.onclick=()=>{
    if(isAndroid){
      const intent='intent://'+host+path+'#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url='+encodeURIComponent(current)+';end';
      location.href=intent;
      return;
    }
    const safari='x-safari-https://'+host+path;
    location.href=safari;
  };

  card.appendChild(btn);
  card.appendChild(copy);
  card.appendChild(note);
  wrap.appendChild(card);
  document.documentElement.appendChild(wrap);
})();