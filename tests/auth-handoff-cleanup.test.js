'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('public/app.html','utf8');
const guard=fs.readFileSync('public/access-guard.js','utf8');
function setup(search,hash='#access_token=synthetic-secret'){
 const location={pathname:'/app.html',search,hash};const requests=[];
 const ctx={window:{location},document:{title:'ウレナビ',getElementById:()=>null},URLSearchParams,history:{replaceState(a,b,url){const parsed=new URL(url,'https://preview.example.test');location.pathname=parsed.pathname;location.search=parsed.search;location.hash=parsed.hash;}},fetch:async url=>{requests.push(url);return {ok:true};}};
 vm.createContext(ctx);
 vm.runInContext(html.slice(html.indexOf('function cleanAuthUrl('),html.indexOf('function getNextSendTime(')),ctx);
 vm.runInContext(guard.slice(guard.indexOf('  async function approveHandoffIfPresent('),guard.indexOf('  function startHandoffPolling(')),ctx);
 return {ctx,requests,location};
}
test('auth URL cleanup preserves handoff until the deferred approval finishes, then removes it',async()=>{
 const code='a'.repeat(64),x=setup('?handoff='+code+'&code=synthetic-code&error_description=private');
 // app's earlier auth callback cleans the URL synchronously; access-guard
 // approves in a subsequent setTimeout callback from the same auth event.
 x.ctx.cleanAuthUrl();
 assert.equal(x.location.hash,'');assert.equal(x.location.search,'?handoff='+code);
 assert.equal(await x.ctx.approveHandoffIfPresent({access_token:'synthetic-session'}),true);
 assert.equal(x.requests.length,1);assert.equal(x.requests[0],'/api/access?action=handoff-approve&code='+code);
 assert.equal(x.location.search,'');assert.equal(x.location.hash,'');
});
test('cleanup never preserves invalid, duplicated, or unrelated authentication query values',()=>{
 for(const search of ['?handoff=bad&code=private','?handoff='+ 'b'.repeat(64)+'&handoff='+ 'c'.repeat(64)+'&code=private','?code=private&token=private&refresh_token=private']){
  const x=setup(search);x.ctx.cleanAuthUrl();assert.equal(x.location.search,'');assert.equal(x.location.hash,'');
 }
});

test('Preview device approval uses its own logged-in origin and retains the production option',async()=>{
 const nodes=[];function node(tag){const n={tag,style:{},children:[],listeners:{},append(...xs){this.children.push(...xs);},replaceChildren(...xs){this.children=xs;},setAttribute(){},addEventListener(type,fn){this.listeners[type]=fn;},insertAdjacentElement(where,child){nodes.push(child);}};nodes.push(n);return n;}
 const login=node('button'),storage=new Map(),polls=[],qrs=[];
 const ctx={window:{location:{origin:'https://current-preview.example.test',search:''}},URLSearchParams,document:{getElementById:id=>id==='loginBtn'?login:null,createElement:node},fetch:async()=>({ok:true,json:async()=>({preview:true})}),localStorage:{setItem:(k,v)=>storage.set(k,v)},HANDOFF_KEY:'pending',randomHandoff:()=> 'd'.repeat(64),startHandoffPolling:x=>polls.push(x),QRCode:class{static CorrectLevel={M:1};constructor(el,opts){qrs.push(opts.text);}}};
 vm.createContext(ctx);vm.runInContext(guard.slice(guard.indexOf('  async function installPreviewOwnerAccess('),guard.indexOf('  function installRoomPostCopyFix(')),ctx);
 await ctx.installPreviewOwnerAccess();
 const buttons=nodes.filter(n=>n.tag==='button'&&n.listeners.click);
 const preview=buttons.find(n=>n.textContent==='この開発版のログインで承認');assert.ok(preview);preview.listeners.click();
 assert.equal(new URL(qrs[0]).origin,'https://current-preview.example.test');assert.equal(new URL(qrs[0]).pathname,'/app.html');assert.equal(new URL(qrs[0]).searchParams.get('handoff'),'d'.repeat(64));assert.deepEqual(polls,[true]);assert.equal(storage.get('pending'),'d'.repeat(64));
 buttons.find(n=>n.textContent==='本番の認証でPreviewを開く').listeners.click();
 assert.equal(new URL(qrs[1]).origin,'https://rakuten-affiliate-ai-mobile.vercel.app');assert.equal(new URL(qrs[1]).pathname,'/api/access');assert.deepEqual(polls,[true,true]);
 const before=nodes.length;ctx.window.location.search='?handoff='+'e'.repeat(64);await ctx.installPreviewOwnerAccess();
 assert.equal(nodes.slice(before).filter(n=>n.tag==='button'&&n.listeners.click).length,0);
 assert.ok(nodes.slice(before).some(n=>n.textContent?.includes('ブラウザ間でログイン状態は共有されません')));
});
