'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),vm=require('node:vm');
const root=path.resolve(__dirname,'../../scripts/rebuild/real-search-preview');
test('real-search deployment uses original app and auth, with no synthetic data or generation routes',()=>{
 const config=JSON.parse(fs.readFileSync(root+'/vercel.json'));assert.equal(config.crons,undefined);assert.equal(config.rewrites,undefined);
 assert.deepEqual(fs.readdirSync(root+'/api').sort(),['access.js','room-copy.js','runtime-env.js','search-v2.js','search.js']);
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'real-ui-'));try{
 const fakeFs={...fs,mkdirSync(){},writeFileSync(name,value){fs.writeFileSync(path.join(out,path.basename(name)),value);},copyFileSync(a,b){fs.copyFileSync(a,path.join(out,path.basename(b)));}};
 const code=fs.readFileSync(root+'/build.cjs','utf8');vm.runInNewContext(code,{require:name=>name==='node:fs'?fakeFs:require(name),__dirname:root,console:{log(){}}});
 const html=fs.readFileSync(out+'/index.html','utf8'),script=fs.readFileSync(out+'/app-inline-1.js','utf8');
 assert.ok(html.includes('data-completed-core-only="true"'));assert.ok(html.includes('id="debugBatchBtn" type="button" disabled hidden'));assert.ok(script.includes('このPreviewでは一括検索を実行しません。'));assert.ok(html.includes('https://cdn.jsdelivr.net/npm/@supabase/'));assert.ok(html.includes('実商品検索の限定検証'));
 assert.ok(!html.includes('fixture-items.js'));assert.ok(!html.includes('isolation.js'));assert.ok(!html.includes('/access-guard.js'));
 assert.ok(html.includes('id="previewCallbackRecovery" hidden'));assert.ok(html.includes('id="loginBtn" class="authBtn">'));
 assert.ok(!html.includes('/email-code-login.js'));assert.ok(!html.includes('/password-login.js'));
 assert.ok(html.includes('新しいサービス登録は不要'));assert.ok(script.includes("flowType:'pkce'"));assert.ok(script.includes('detectSessionInUrl:true'));
 assert.ok(html.includes('/auth-callback-recovery.js'));assert.ok(!script.includes('UrenaviEmailLinkLogin.signIn'));assert.ok(fs.readdirSync(out).filter(n=>/^app-inline-.*js$/.test(n)).some(n=>fs.readFileSync(path.join(out,n),'utf8').includes('UrenaviPreviewCallback.mount')));assert.ok(!script.includes('「Sign in」を開かずに長押し'));
 assert.ok(script.includes('previewLoginUncertain'));assert.ok(script.includes('authDeadline(sb.auth.signInWithOtp({'));
 assert.ok(fs.readFileSync(path.resolve(root,'../../../public/app.html'),'utf8').includes('届いたリンクを押してください。'));
 assert.ok(html.includes('authObservation'));assert.ok(html.includes('/auth-observation.js'));assert.ok(script.includes('UrenaviAuthObservation.watch(sb.auth)'));assert.ok(script.includes('UrenaviAuthObservation.access(response.status)'));assert.ok(script.includes('supabase.createClient'));assert.ok(script.includes("'/api/search?'+"));assert.ok(script.includes('completed-cache-only'));assert.ok(script.includes('autoAi=false'));assert.ok(!script.includes('AppFixtureItems'));
 }finally{fs.rmSync(out,{recursive:true,force:true});}
});
test('OTP readiness is explicit, Preview-only and bound to the recovery branch',()=>{
 const h=require(root+'/api/runtime-env'),keys=['VERCEL_ENV','VERCEL_GIT_COMMIT_REF','URENAVI_PREVIEW_EMAIL_OTP'],previous=keys.map(k=>process.env[k]);
 try{
  for(const [environment,branch,approval,expected] of [['preview','recovery/urenavi-core-20261030','',false],['production','recovery/urenavi-core-20261030','smtp-and-template-verified',false],['preview','main','smtp-and-template-verified',false],['preview','recovery/urenavi-core-20261030','smtp-and-template-verified',true]]){
   [process.env.VERCEL_ENV,process.env.VERCEL_GIT_COMMIT_REF,process.env.URENAVI_PREVIEW_EMAIL_OTP]=[environment,branch,approval];
   const r={setHeader(){},status(){return this;},json(v){this.body=v;}};h({},r);assert.equal(r.body.emailOtpReady,expected);assert.equal(r.body.inferenceEnabled,false);
  }
 }finally{keys.forEach((k,i)=>{if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];});}
});
test('real-search access route rejects all write/payment actions before authorization',async()=>{
 const r={setHeader(){},status(n){this.code=n;return this;},json(v){this.body=v;}};const h=require(root+'/api/access');await h({method:'POST',query:{action:'upgrade-pro'}},r);assert.equal(r.code,403);
});

// Exercise the emitted sender, rather than a second implementation of login.
function senderHarness({origin='https://rakuten-affiliate-ai-mobile-git-recovery-u-aa2890-hirobeya-6572.vercel.app',send=async()=>({error:null}),deadline=p=>p}={}){
 const out=fs.mkdtempSync(path.join(os.tmpdir(),'pkce-send-'));
 try{
  const fakeFs={...fs,mkdirSync(){},writeFileSync(n,v){fs.writeFileSync(path.join(out,path.basename(n)),v);},copyFileSync(a,b){fs.copyFileSync(a,path.join(out,path.basename(b)));}};
  vm.runInNewContext(fs.readFileSync(root+'/build.cjs','utf8'),{require:n=>n==='node:fs'?fakeFs:require(n),__dirname:root,console:{log(){}}});
  const script=fs.readFileSync(out+'/app-inline-1.js','utf8');
  const buttonCode=script.slice(script.indexOf('function updateLoginButton(){'),script.indexOf('async function logout('));
  const sendCode=script.slice(script.indexOf('loginBtn.onclick='),script.indexOf('loginEmail.addEventListener('));
  let calls=0,next=0,message='',cooldowns=0,logs=[];
  const button={disabled:false,textContent:''};
  const context={loginBtn:button,loginEmail:{value:'synthetic@example.invalid'},location:{origin},window:{location:{origin}},navigator:{onLine:true},Date,
   getNextSendTime:()=>next,startSendCooldown:()=>{cooldowns++;next=Date.now()+60000;},setAuthMessage:s=>{message=s;},authDeadline:deadline,
   previewCallbackRecovery:{refresh:async()=>{}},setTimeout:()=>1,clearTimeout(){},console:{error:v=>logs.push(v)},
   sb:{auth:{signInWithOtp:async args=>{calls++;assert.equal(args.options.shouldCreateUser,false);assert.equal(args.options.emailRedirectTo,origin+'/app.html');return send(args);}}}};
  vm.createContext(context);vm.runInContext("let sendingLogin=false,previewLoginUncertain=false,previewCallbackBlocksSend=false,retainedAuthError='',sendTimer=null;const SEND_COOLDOWN_MS=60000;",context);
  vm.runInContext(buttonCode+sendCode,context);
  return {button,calls:()=>calls,message:()=>message,cooldowns:()=>cooldowns,logs};
 }finally{fs.rmSync(out,{recursive:true,force:true});}
}
test('PKCE sender refuses a different origin and sends only once while pending or cooling down',async()=>{
 const foreign=senderHarness({origin:'https://unrelated.example.invalid'});await foreign.button.onclick();assert.equal(foreign.calls(),0);
 let finish;const x=senderHarness({send:()=>new Promise(r=>{finish=r;})});
 const pending=x.button.onclick();await x.button.onclick();assert.equal(x.calls(),1);
 finish({error:null});await pending;await x.button.onclick();assert.equal(x.calls(),1);assert.equal(x.cooldowns(),1);
 assert.match(x.message(),/元の画面/);
});
test('uncertain email send stops further sends and never logs a provider credential',async()=>{
 for(const failure of [Error('認証確認が時間内に完了しませんでした。'),new TypeError('synthetic-private-provider-detail')]){
  const x=senderHarness({deadline:()=>Promise.reject(failure)});await x.button.onclick();await x.button.onclick();
  assert.equal(x.calls(),1);assert.equal(x.button.disabled,true);assert.equal(x.cooldowns(),0);assert.equal(x.logs.length,0);
  assert.ok(!x.message().includes('synthetic-private'));assert.match(x.message(),/送信結果を確認できません/);
 }
});
test('provider rate limit remains a stopped send with no automatic retry',async()=>{
 const x=senderHarness({send:async()=>({error:{status:429,code:'over_email_send_rate_limit',message:'synthetic-private-provider-detail'}})});
 await x.button.onclick();await x.button.onclick();assert.equal(x.calls(),1);assert.equal(x.cooldowns(),1);assert.equal(x.logs.length,0);assert.ok(!x.message().includes('synthetic-private'));
});
