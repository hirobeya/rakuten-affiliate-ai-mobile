'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const source=fs.readFileSync(require.resolve('../public/access-guard'),'utf8');
test('late render decorator preserves restore/no-AI options and return value',()=>{
  const start=source.indexOf('  function installSafePostPreviewLinks('),end=source.indexOf('  function installPriceLayout(',start);
  let received;
  const document={addEventListener(){},getElementById(){return {querySelectorAll(){return [];}};}};
  const ctx={document,render:(...args)=>{received=args;return 'rendered';}};ctx.window=ctx;
  vm.createContext(ctx);vm.runInContext(source.slice(start,end)+'installSafePostPreviewLinks();',ctx);
  const items=[{itemCode:'restore:1',itemName:'収納ボックス'}],options={autoAi:false,restored:true};
  assert.equal(ctx.render(items,options),'rendered');
  assert.equal(received[0],items);assert.equal(received[1],options);
  assert.equal(received[1].autoAi,false,'restoring results must not silently restart provider calls');
});
test('login decoration reflects closed sales without a dead payment link or old price',()=>{
  const start=source.indexOf('  function addPurchaseLink('),end=source.indexOf('  function applyActivationMessage(',start);
  let inserted;
  const ctx={document:{getElementById(id){return id==='loginBtn'?{insertAdjacentElement(_,el){inserted=el;}}:null;},createElement(tag){return {tag,style:{}};}}};
  vm.createContext(ctx);vm.runInContext(source.slice(start,end)+'addPurchaseLink();',ctx);
  assert.equal(inserted.tag,'div');assert.equal(inserted.href,undefined);
  assert.match(inserted.textContent,/準備中/);assert.doesNotMatch(inserted.textContent,/980|始める/);
});
test('loading the complete legacy decorator cannot replace current comparison semantics',()=>{
  const decision=()=> 'current grounded comparison',pts=()=>['current evidence'];
  const ctx={decision,pts,URLSearchParams,document:{getElementById(){return null;},addEventListener(){}},
    sb:{auth:{signInWithOtp:async()=>({}),getSession:()=>new Promise(()=>{}),onAuthStateChange(){}}},
    localStorage:{getItem(){return null;}},fetch:async()=>({ok:false,json:async()=>({})}),authDeadline:x=>x,setTimeout(){}};
  ctx.window=ctx;ctx.location={search:'',origin:'https://example.test'};
  vm.runInNewContext(source,ctx);
  assert.equal(ctx.decision,decision);assert.equal(ctx.pts,pts);
  assert.equal(ctx.decision(),'current grounded comparison');
});
