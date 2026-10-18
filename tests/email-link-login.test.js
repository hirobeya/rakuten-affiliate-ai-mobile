'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const {tokenHash,signIn}=require('../public/email-link-login');
const provider='https://example.supabase.co',token='a'.repeat(64);
const link=provider+'/auth/v1/verify?token='+token+'&type=magiclink&redirect_to=https://untrusted.test/';
test('same-provider magic link is verified by SDK without following its redirect',async()=>{
  let received;const session={access_token:'synthetic-session',user:{id:'test-user'}};
  const result=await signIn(link,{supabaseUrl:provider,auth:{verifyOtp:async args=>{received=args;return {data:{session},error:null};}}});
  assert.equal(result,session);assert.deepEqual(received,{token_hash:token,type:'email'});
});
test('untrusted providers, callbacks, recovery, duplicate or malformed credentials are rejected before SDK',async()=>{
  const bad=[link.replace(provider,'https://evil.test'),link.replace('/verify','/callback'),link.replace('magiclink','recovery'),link+'&token='+token,link+'#fragment','javascript:alert(1)',provider+'/auth/v1/verify?token=x&type=email'];
  let calls=0;
  for(const value of bad)await assert.rejects(signIn(value,{supabaseUrl:provider,auth:{verifyOtp:async()=>{calls++;}}}),/invalid_link/);
  assert.equal(calls,0);
});
test('provider rejection and missing sessions never create a successful login',async()=>{
  for(const result of [{error:{message:'expired'},data:{session:null}},{error:null,data:{session:null}}]){
    await assert.rejects(signIn(link,{supabaseUrl:provider,auth:{verifyOtp:async()=>result}}),/verification_failed/);
  }
  assert.equal(tokenHash(provider+'/auth/v1/verify?token_hash='+token+'&type=email',provider),token);
});
test('actual login handler clears the credential and restores controls after failed verification',async()=>{
  const html=fs.readFileSync(require.resolve('../public/app.html'),'utf8');
  const start=html.indexOf("document.getElementById('verifyEmailLoginLink').addEventListener(");
  const end=html.indexOf('let sendTimer=null;',start);
  const input={value:link},button={disabled:false,addEventListener(_,fn){this.click=fn;}};let shown=0,message='';
  const ctx={document:{getElementById:id=>id==='emailLoginLink'?input:button},SUPABASE_URL:provider,sb:{auth:{}},setAuthMessage:value=>{message=value;},authDeadline:x=>x,
    UrenaviEmailLinkLogin:{signIn:async()=>{assert.equal(input.value,'');throw Error('synthetic failure');}},showApp:async()=>{shown++;}};
  vm.runInNewContext(html.slice(start,end),ctx);
  await button.click();assert.equal(input.value,'');assert.equal(button.disabled,false);assert.equal(shown,0);
  assert.match(message,/確認できません/);assert.ok(!message.includes(token));
});
