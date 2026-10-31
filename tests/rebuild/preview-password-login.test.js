'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('scripts/rebuild/real-search-preview/password-login.js','utf8');
function setup(grant,deadline=p=>p){
 const input={value:'synthetic-private-password'},button={disabled:false,addEventListener(_,fn){this.click=fn;}};
 let attempts=0,opened=0,message='';
 const context={document:{getElementById:id=>id==='previewLoginPassword'?input:button},loginEmail:{value:'test@example.invalid'},
  sb:{auth:{signInWithPassword:async args=>{attempts++;assert.equal(input.value,'');assert.equal(args.password,'synthetic-private-password');return grant(args);}}},
  authDeadline:deadline,setAuthMessage:s=>{message=s;},showApp:async s=>{assert.equal(s.access_token,'synthetic-access');opened++;}};
 vm.createContext(context);vm.runInContext("let retainedAuthError='',accessGeneration=0;",context);vm.runInContext(source,context);
 return {input,button,attempts:()=>attempts,opened:()=>opened,message:()=>message};
}
test('existing-password grant reaches unchanged app authorization only after a verified session',async()=>{
 const x=setup(async()=>({data:{session:{access_token:'synthetic-access'}},error:null}));await x.button.click();
 assert.equal(x.attempts(),1);assert.equal(x.opened(),1);assert.equal(x.input.value,'');assert.equal(x.button.disabled,false);
});
test('rejected, missing-session and rate-limited grants never open app or expose provider secrets',async()=>{
 for(const result of [{error:{code:'invalid_credentials',message:'synthetic-private-password'}},{data:{session:null}},{error:{status:429,message:'synthetic-private-password'}}]){
  const x=setup(async()=>result);await x.button.click();assert.equal(x.attempts(),1);assert.equal(x.opened(),0);assert.equal(x.input.value,'');assert.ok(!x.message().includes('synthetic-private-password'));assert.ok(!x.message().includes('synthetic-access'));
 }
});
test('pending and timed-out sign-in cannot be resent automatically or by a second click',async()=>{
 let finish;const pending=new Promise(resolve=>{finish=resolve;});
 const x=setup(()=>pending);const first=x.button.click();await x.button.click();assert.equal(x.attempts(),1);finish({error:{code:'invalid_credentials'}});await first;
 const y=setup(()=>new Promise(()=>{}),()=>Promise.reject(Error('認証確認が時間内に完了しませんでした。')));
 await y.button.click();await y.button.click();assert.equal(y.attempts(),1);assert.equal(y.opened(),0);assert.equal(y.button.disabled,true);assert.equal(y.input.value,'');
});
