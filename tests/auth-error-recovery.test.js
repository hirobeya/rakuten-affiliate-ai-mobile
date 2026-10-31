'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('public/app.html','utf8');
function setup(){
 const location={pathname:'/app.html',search:'',hash:'#error=access_denied&error_code=otp_expired&error_description=synthetic-private'};
 const elements={res:{replaceChildren(){}},emailLoginLink:{value:''},verifyEmailLoginLink:{disabled:false,addEventListener(_,fn){this.click=fn;}}};
 let reads=0,message='';const authGate={style:{}},appRoot={style:{display:'none'}};
 const ctx={window:{location,localStorage:{removeItem(){}}},location,document:{title:'test',getElementById:id=>elements[id]},URLSearchParams,Map,
  history:{replaceState(a,b,url){const x=new URL(url,'https://preview.example.test');location.search=x.search;location.hash=x.hash;}},
  authGate,appRoot,authDeadline:p=>p,updateLoginButton(){},setAuthMessage:x=>{message=x;},console:{error(){}},
  sb:{auth:{getSession:async()=>{reads++;return {data:{session:null},error:null};},signOut:async()=>{}}},
  UrenaviReturnState:{clear(){}},sessionStorage:{},localStorage:{removeItem(){}},sessionTooOld(){return false;}};
 vm.createContext(ctx);vm.runInContext("let retainedAuthError='',accessGeneration=0,lastSearchItems=[],lastSearchKeyword='',aiRoomResults=new Map(),aiRoomReviews=new Map(),aiRunGeneration=0;",ctx);
 for(const [start,end] of [['function showLogin(','// Sanitized UI text only;'],['function getUrlAuthError(){','function getNextSendTime(){'],['async function checkAuth(){','loginBtn.onclick='],['async function logout(','async function checkAuth(){']]){
  vm.runInContext(html.slice(html.indexOf(start),html.indexOf(end,html.indexOf(start))),ctx);
 }
 return {ctx,location,appRoot,elements,reads:()=>reads,message:()=>message,retained:()=>vm.runInContext('retainedAuthError',ctx)};
}
test('expired callback error remains visible after URL cleanup and subsequent automatic auth checks',async()=>{
 const x=setup();await x.ctx.checkAuth();const first=x.message();assert.match(first,/使用されています/);
 assert.equal(x.location.hash,'');assert.equal(x.retained(),first);assert.ok(!first.includes('synthetic-private'));
 await x.ctx.checkAuth();await x.ctx.checkAuth();assert.equal(x.message(),first);assert.equal(x.reads(),2);assert.equal(x.appRoot.style.display,'none');
});
test('pasted-link rejection survives later empty-session checks; credentials are cleared and no retry is made',async()=>{
 const x=setup();x.location.hash='';x.elements.emailLoginLink.value='synthetic-private';let verification=0;
 x.ctx.SUPABASE_URL='https://example.supabase.co';x.ctx.showApp=async()=>{throw Error('must not open');};
 x.ctx.UrenaviEmailLinkLogin={signIn:async()=>{verification++;throw Error('rejected');},errorMessage:()=> 'リンクを確認できませんでした。'};
 const start=html.indexOf("document.getElementById('verifyEmailLoginLink').addEventListener(");vm.runInContext(html.slice(start,html.indexOf('let sendTimer=null;',start)),x.ctx);
 await x.elements.verifyEmailLoginLink.click();assert.equal(verification,1);assert.equal(x.elements.emailLoginLink.value,'');assert.equal(x.elements.verifyEmailLoginLink.disabled,false);
 await x.ctx.checkAuth();assert.equal(x.message(),'リンクを確認できませんでした。');assert.equal(verification,1);assert.equal(x.appRoot.style.display,'none');
});
test('ordinary missing session stays unauthenticated and explicit logout clears retained callback error',async()=>{
 const x=setup();await x.ctx.checkAuth();assert.ok(x.retained());await x.ctx.logout();assert.equal(x.retained(),'');assert.equal(x.message(),'');
 await x.ctx.checkAuth();assert.equal(x.message(),'');assert.equal(x.appRoot.style.display,'none');
});
