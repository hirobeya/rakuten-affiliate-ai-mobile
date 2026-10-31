// Isolated Preview only. Reuse the account's existing Supabase credential and
// the application's existing server authorization; never issue/reset passwords.
(()=>{
 'use strict';
 const passwordInput=document.getElementById('previewLoginPassword');
 const button=document.getElementById('previewPasswordLogin');
 if(!passwordInput||!button)return;
 button.addEventListener('click',async()=>{
  if(button.disabled)return;
  const email=loginEmail.value.trim(),password=passwordInput.value;
  if(!email||!password){setAuthMessage('メールアドレスと、ウレナビに設定済みのパスワードを入力してください。','err');return;}
  button.disabled=true;passwordInput.value='';retainedAuthError='';accessGeneration++;
  let timedOut=false;
  try{
   setAuthMessage('ログイン情報を確認しています。');
   const result=await authDeadline(sb.auth.signInWithPassword({email,password}),12000);
   if(result?.error){
    const limited=['over_request_rate_limit','over_email_send_rate_limit'].includes(result.error.code)||result.error.status===429;
    throw Error(limited?'rate_limited':'credentials_rejected');
   }
   if(!result?.data?.session?.access_token)throw Error('credentials_rejected');
   await showApp(result.data.session);
  }catch(error){
   timedOut=error?.message==='認証確認が時間内に完了しませんでした。';
   retainedAuthError=timedOut?'認証結果が未確定のため再送しません。画面を開き直し、ログイン状態を確認してください。':error?.message==='rate_limited'?'認証回数の上限です。自動再試行は行いません。時間を空けてください。':'ログインできませんでした。ウレナビに設定済みのメールアドレス・パスワードを確認してください。GoogleやVercelのパスワードとは別です。';
   setAuthMessage(retainedAuthError,'err');
  }finally{passwordInput.value='';button.disabled=timedOut;}
 });
})();
