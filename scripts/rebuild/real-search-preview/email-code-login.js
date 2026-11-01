// Preview-only OTP UI. Supabase and showApp retain all authentication and owner
// checks. No email is sent until the SMTP/template readiness flag is approved.
(()=>{
 'use strict';
 const canonical='https://rakuten-affiliate-ai-mobile-git-recovery-u-aa2890-hirobeya-6572.vercel.app';
 const codeInput=document.getElementById('previewEmailCode');
 const send=document.getElementById('previewSendCode'),verify=document.getElementById('previewVerifyCode');
 if(!codeInput||!send||!verify)return;
 let ready=false,busy=false,uncertain=false,sentEmail='';
 const refresh=()=>{send.disabled=!ready||busy||uncertain;verify.disabled=!ready||busy||uncertain;};
 const message=s=>{retainedAuthError=s;setAuthMessage(s,'err');};
 function email(){
  const value=loginEmail.value.trim();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))throw Error('invalid_email');
  return value;
 }
 function failure(error){
  if(error?.message==='認証確認が時間内に完了しませんでした。'){
   uncertain=true;return '認証処理の結果が未確定です。自動再送はしません。画面を開き直して状態を確認してください。';
  }
  if(error?.message==='invalid_email')return 'メールアドレスを確認してください。';
  if(error?.message==='invalid_code')return 'メールに記載された数字の確認コードを入力してください。';
  if(error?.message==='email_changed')return '送信時のメールアドレスと異なります。送信先と入力内容を確認してください。';
  if(error?.status===429||['over_request_rate_limit','over_email_send_rate_limit'].includes(error?.code))return '認証の利用上限です。自動再試行はしません。時間を空けてください。';
  if(error?.code==='otp_expired')return '確認コードが無効・期限切れ・使用済みです。最新のメールと送信先を確認してください。';
  return '認証処理を完了できませんでした。接続状態と入力内容を確認してください。';
 }
 send.addEventListener('click',async()=>{
  if(!ready||busy||uncertain)return;
  if(Date.now()<getNextSendTime()){message('再送できる時刻までお待ちください。');return;}
  busy=true;refresh();codeInput.value='';retainedAuthError='';
  try{
   const address=email();setAuthMessage('確認コードを送信しています。');
   const result=await authDeadline(sb.auth.signInWithOtp({email:address,options:{shouldCreateUser:false,emailRedirectTo:canonical+'/app.html'}}),12000);
   if(result?.error)throw result.error;
   sentEmail=address.toLowerCase();startSendCooldown();
   setAuthMessage('確認コードを送信しました。メールの数字をこの画面に入力してください。リンクを開く必要はありません。','ok');
  }catch(error){if(error?.status===429)startSendCooldown();message(failure(error));}
  finally{busy=false;refresh();}
 });
 verify.addEventListener('click',async()=>{
  if(!ready||busy||uncertain)return;
  busy=true;refresh();retainedAuthError='';accessGeneration++;
  try{
   const address=email(),token=codeInput.value.trim();codeInput.value='';
   if(!/^[0-9]{6,10}$/.test(token))throw Error('invalid_code');
   if(sentEmail&&sentEmail!==address.toLowerCase())throw Error('email_changed');
   setAuthMessage('確認コードを認証しています。');
   const result=await authDeadline(sb.auth.verifyOtp({email:address,token,type:'email'}),12000);
   if(result?.error)throw result.error;
   if(!result?.data?.session?.access_token)throw Error('session_missing');
   await showApp(result.data.session);
  }catch(error){message(failure(error));}
  finally{codeInput.value='';busy=false;refresh();}
 });
 refresh();
 if(window.location.origin!==canonical){message('確認コード認証は指定の本体Preview URLでのみ利用できます。');return;}
 void(async()=>{
  try{
   const r=await fetch('/api/runtime-env',{cache:'no-store',credentials:'same-origin'});
   const config=r.ok?await r.json():null;
   ready=config?.preview===true&&config?.approvedUserConfigured===true&&config?.emailOtpReady===true;
  }catch{ready=false;}
  if(!ready)message('確認コード方式の送信元設定は準備中です。メール送信・コード認証はまだ実行できません。');
  refresh();
 })();
})();
