'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('scripts/rebuild/real-search-preview/email-code-login.js','utf8');
const origin='https://rakuten-affiliate-ai-mobile-git-recovery-u-aa2890-hirobeya-6572.vercel.app';
async function setup({ready=true,sendResult={error:null},verifyResult={data:{session:{access_token:'synthetic-session'}}},deadline=p=>p}={}){
 const input={value:'123456'},send={disabled:true,addEventListener(_,f){this.click=f;}},verify={disabled:true,addEventListener(_,f){this.click=f;}},email={value:'test@example.invalid'};
 const calls=[];let shown=0,message='',next=0;
 const ctx={document:{getElementById:id=>({previewEmailCode:input,previewSendCode:send,previewVerifyCode:verify}[id])},window:{location:{origin}},loginEmail:email,Date,
  fetch:async(path,options)=>{assert.equal(path,'/api/runtime-env');assert.equal(options.cache,'no-store');return {ok:true,json:async()=>({preview:true,approvedUserConfigured:true,emailOtpReady:ready})};},
  sb:{auth:{signInWithOtp:async args=>{calls.push(['send',args]);return sendResult;},verifyOtp:async args=>{calls.push(['verify',args]);assert.equal(input.value,'');return typeof verifyResult==='function'?verifyResult():verifyResult;}}},
  authDeadline:deadline,getNextSendTime:()=>next,startSendCooldown:()=>{next=Date.now()+60000;},setAuthMessage:s=>{message=s;},showApp:async s=>{assert.equal(s.access_token,'synthetic-session');shown++;}};
 vm.createContext(ctx);vm.runInContext("let retainedAuthError='',accessGeneration=0;",ctx);vm.runInContext(source,ctx);await new Promise(setImmediate);
 return {input,send,verify,email,calls,shown:()=>shown,message:()=>message};
}
test('pending SMTP/template never sends or verifies codes on load or click',async()=>{
 const x=await setup({ready:false});await x.send.click();await x.verify.click();assert.deepEqual(x.calls,[]);assert.equal(x.send.disabled,true);assert.equal(x.verify.disabled,true);assert.match(x.message(),/準備中/);
});
test('OTP uses exact conditional-template destination, no signup and unchanged server authorization',async()=>{
 const x=await setup();assert.equal(x.calls.length,0);await x.send.click();
 assert.equal(x.calls[0][1].options.shouldCreateUser,false);assert.equal(x.calls[0][1].options.emailRedirectTo,origin+'/app.html');
 await x.send.click();assert.equal(x.calls.length,1); // existing resend cooldown
 x.input.value='123456';await x.verify.click();assert.deepEqual(JSON.parse(JSON.stringify(x.calls[1][1])),{email:'test@example.invalid',token:'123456',type:'email'});assert.equal(x.shown(),1);assert.equal(x.input.value,'');assert.ok(!x.message().includes('123456'));
 const template=fs.readFileSync('docs/rebuild-20261028/auth-paste-rejection-20261031/magic-link-or-otp.pending.html','utf8');
 assert.ok(template.includes('eq .RedirectTo "'+origin+'/app.html"'));assert.ok(template.split('{{ else }}')[0].includes('{{ .Token }}'));assert.ok(!template.split('{{ else }}')[0].includes('{{ .ConfirmationURL }}'));assert.ok(template.split('{{ else }}')[1].includes('{{ .ConfirmationURL }}'));
});
test('changed email, malformed code and missing/rejected sessions never publish authentication',async()=>{
 const x=await setup();await x.send.click();x.email.value='other@example.invalid';x.input.value='123456';await x.verify.click();assert.equal(x.calls.length,1);assert.equal(x.shown(),0);
 x.email.value='test@example.invalid';x.input.value='123';await x.verify.click();assert.equal(x.calls.length,1);
 for(const verifyResult of [{data:{session:null}},{error:{code:'otp_expired',message:'secret-code-123456'}}]){const y=await setup({verifyResult});await y.verify.click();assert.equal(y.shown(),0);assert.equal(y.input.value,'');assert.ok(!y.message().includes('123456'));}
});
test('rate limits and uncertain timeout never trigger automatic or duplicate verification',async()=>{
 const x=await setup({verifyResult:{error:{status:429,message:'secret-code-123456'}}});await x.verify.click();assert.equal(x.calls.length,1);assert.match(x.message(),/上限/);assert.equal(x.shown(),0);
 let finish;const p=new Promise(resolve=>{finish=resolve;});const y=await setup({verifyResult:()=>p});const first=y.verify.click();await y.verify.click();assert.equal(y.calls.length,1);finish({error:{code:'otp_expired'}});await first;
 const z=await setup({deadline:()=>Promise.reject(Error('認証確認が時間内に完了しませんでした。'))});await z.verify.click();await z.verify.click();await z.send.click();assert.equal(z.calls.length,1);assert.equal(z.verify.disabled,true);assert.equal(z.send.disabled,true);assert.equal(z.shown(),0);
});
