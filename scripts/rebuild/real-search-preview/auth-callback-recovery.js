(function(root,factory){
 'use strict';
 const api=factory();
 if(typeof module==='object'&&module.exports)module.exports=api;
 if(root){root.UrenaviPreviewCallback=api;api.capture(root);}
})(typeof window==='undefined'?null:window,function(){
 'use strict';
 const origin='https://rakuten-affiliate-ai-mobile-git-recovery-u-aa2890-hirobeya-6572.vercel.app';
 const key='sb-upooxcugrplfmjnqpuxs-auth-token-code-verifier';
 let captured=null;
 function parse(value){
  if(typeof value!=='string'||value.length>4096)throw Error('invalid_callback');
  let u;try{u=new URL(value.trim());}catch{throw Error('invalid_callback');}
  if(u.origin!==origin||u.pathname!=='/app.html'||u.username||u.password||u.hash)throw Error('invalid_callback');
  if([...u.searchParams.keys()].some(k=>k!=='code'))throw Error('invalid_callback');
  const codes=u.searchParams.getAll('code');
  if(codes.length!==1||!/^[A-Za-z0-9_-]{20,256}$/.test(codes[0]))throw Error('invalid_callback');
  return {code:codes[0],url:origin+'/app.html?code='+encodeURIComponent(codes[0])};
 }
 function verifier(storage){
  try{const raw=storage.getItem(key);if(raw===null)return 'absent';const value=JSON.parse(raw);return typeof value==='string'&&value.length>0?'present':'absent';}
  catch{return 'unavailable';}
 }
 function capture(win){
  // Capture only inside the page. No code, verifier or URL is logged/persisted.
  const u=new URL(win.location.href);let kind='none',result=null;
  if(u.searchParams.has('code')){try{result=parse(u.href);kind='code-present';}catch{kind='invalid';}}
  else if(u.searchParams.has('error')||u.hash.includes('error'))kind='provider-error';
  captured={kind,result,initialVerifier:verifier(win.localStorage)};
 }
 function create({auth,storage,deadline,onSession,onStatus=()=>{},onObservation=()=>{},onStart=()=>{}}){
  let attempted=false,pending=false,unknown=false;
  const state={callback:captured?.kind??'none',verifier:verifier(storage),exchange:'not-started'};
  const publish=()=>onObservation({...state});
  const message=(text)=>onStatus(text);
  function observe(){state.verifier=verifier(storage);publish();return {...state};}
  async function complete(value){
   if(attempted||pending||unknown)return false;
   let callback;try{callback=parse(value);}catch{message('メール内のSign inリンクではなく、認証後の画面にある「戻り情報をコピー」でコピーした内容を入力してください。');return false;}
   state.callback='code-present';
   if(verifier(storage)!=='present'){observe();message('送信時の確認情報がこのブラウザにありません。メール送信を始めた元の画面で完了してください。再送はしません。');return false;}
   // Exactly one manual exchange per page. Failure/timeout never retries.
   attempted=true;pending=true;state.exchange='pending';onStart();publish();
   try{
    const result=await deadline(auth.exchangeCodeForSession(callback.code),12000);
    if(result?.error||!result?.data?.session?.access_token){state.exchange='rejected';message('認証を完了できませんでした。戻り情報の期限切れ・使用済み・照合不一致の可能性があります。再送せず停止してください。');return false;}
    state.exchange='session-present';await onSession(result.data.session);return true;
   }catch(error){
    unknown=true;state.exchange='unknown';message('認証の結果を確認できませんでした。二重処理を防ぐため、この画面から再実行しません。');return false;
   }finally{pending=false;callback=null;publish();}
  }
  return {complete,observe,snapshot:()=>({...state}),locked:()=>attempted||pending||unknown};
 }
 function mount({auth,storage,deadline,onSession,onStatus,onStart}){
  const d=document,details=d.getElementById('previewCallbackRecovery'),input=d.getElementById('previewReturnedCallback'),button=d.getElementById('previewCompleteCallback'),relay=d.getElementById('previewCallbackRelay'),copy=d.getElementById('previewCopyCallback'),observation=d.getElementById('previewCallbackObservation');
  const c=create({auth,storage,deadline,onSession,onStatus,onStart,onObservation:s=>{observation.textContent=Object.entries(s).map(([k,v])=>k+': '+v).join('\n');}});
  button.addEventListener('click',async()=>{if(button.disabled)return;const value=input.value;input.value='';button.disabled=true;await c.complete(value);input.value='';button.disabled=c.locked();});
  copy.addEventListener('click',async()=>{
   if(!captured?.result||captured.initialVerifier!=='absent')return;
   try{await navigator.clipboard.writeText(captured.result.url);onStatus('戻り情報をコピーしました。メール送信を始めた元の画面へ戻り、「別のブラウザで開いた場合」に貼り付けてください。チャットには送らないでください。');}
   catch{onStatus('コピーが許可されませんでした。ログインやメール再送は行っていません。');}
  });
  async function refresh(){
   const s=c.observe();
   try{
    const result=await deadline(auth.getSession(),12000);
    if(result?.data?.session){captured=null;relay.hidden=true;details.hidden=true;input.value='';return;}
   }catch{onStatus('認証状態を確認できません。再送せず停止してください。');return;}
   const hasOwn=captured?.result&&captured.initialVerifier==='present';
   if(captured?.result&&captured.initialVerifier==='absent'){
    relay.hidden=false;details.hidden=true;
    // This SDK cannot exchange without the originating verifier. Remove the
    // captured code from the visible URL; keep it only for the user's copy.
    history.replaceState({},document.title,'/app.html');
    onStatus('メールの確認は終わっていますが、送信時の確認情報がこのブラウザにありません。下の「戻り情報をコピー」で、元の画面へ戻して完了できます。メールのSign inは開き直さないでください。');
   }else if(hasOwn){
    relay.hidden=true;details.hidden=true;onStatus('戻り情報と送信時の確認情報はありますが、ログイン状態を作れませんでした。再送せず停止してください。');
   }else if(s.verifier==='present'){
    details.hidden=false;details.open=true;
   }else if(s.verifier==='unavailable')onStatus('このブラウザの確認情報を読み取れません。再送せず停止してください。');
  }
  void refresh();
  window.addEventListener('pageshow',()=>{void refresh();});
  window.addEventListener('focus',()=>{void refresh();});
  // One delegated send listener is already owned by app.html. Refresh only
  // observes SDK storage after an explicit send; it never issues an email.
  return {...c,refresh};
 }
 return {parse,verifier,capture,create,mount,sendBlocked:()=>!!captured?.result};
});
