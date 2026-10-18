(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  if(root)root.UrenaviEmailLinkLogin=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  function tokenHash(value,supabaseUrl){
    if(typeof value!=='string'||value.length>4096)throw Error('invalid_link');
    let link,provider;try{link=new URL(value.trim());provider=new URL(supabaseUrl);}catch{throw Error('invalid_link');}
    if(provider.protocol!=='https:'||link.origin!==provider.origin||link.pathname!=='/auth/v1/verify'||link.username||link.password||link.hash)throw Error('invalid_link');
    const types=link.searchParams.getAll('type');
    if(types.length!==1||!['email','magiclink'].includes(types[0]))throw Error('invalid_link');
    const tokens=[...link.searchParams.getAll('token'),...link.searchParams.getAll('token_hash')];
    if(tokens.length!==1||! /^[A-Za-z0-9_-]{32,1024}$/.test(tokens[0]))throw Error('invalid_link');
    return tokens[0];
  }
  async function signIn(value,{supabaseUrl,auth}){
    const token_hash=tokenHash(value,supabaseUrl);
    const result=await auth.verifyOtp({token_hash,type:'email'});
    if(result?.error){
      // Never expose provider messages, which can contain credential-bearing URLs.
      const code=['otp_expired','over_request_rate_limit','over_email_send_rate_limit'].includes(result.error.code)?result.error.code:'verification_failed';
      throw Error(code);
    }
    if(!result?.data?.session?.access_token)throw Error('verification_failed');
    return result.data.session;
  }
  function errorMessage(error){
    switch(error?.message){
      case 'invalid_link':return 'メール内のログインボタンのリンクをコピーしてください。この欄には本番の認証承認URLは使用できません。';
      case 'otp_expired':return 'ログインリンクの有効期限が切れたか、すでに使用されています。最新の未使用のリンクをお使いください。';
      case 'over_request_rate_limit':case 'over_email_send_rate_limit':return '認証の回数が上限に達しています。時間を空けてからお試しください。自動再試行は行いません。';
      case '認証確認が時間内に完了しませんでした。':return '認証の応答が時間内に届きませんでした。通信状態を確認してください。ログイン成功はまだ確認できていません。';
      default:return 'リンクを確認できませんでした。認証または通信のエラーです。リンクを開き直す前に通信状態を確認してください。';
    }
  }
  return {tokenHash,signIn,errorMessage};
});
