'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function setup(){
 const nodes={appRoot:{style:{display:'block'}},res:{children:[]},userMail:{textContent:'owner@example.test'},k:{value:''},min:{value:''},max:{value:''},sort:{value:''},st:{textContent:''},x:{classList:{toggle(){}}}};
 let resolve,calls=0;const renders=[];
 const root={document:{readyState:'loading',hidden:false,getElementById:id=>nodes[id]||null,querySelectorAll:()=>[],addEventListener(){}},addEventListener(){},render(items,options){renders.push({items,options});nodes.res.children=items.map(()=>({}));}};
 const context={window:root,URL,URLSearchParams,AbortController,setTimeout,clearTimeout,console,fetch:async()=>{calls++;return new Promise(r=>{resolve=body=>r({ok:true,json:async()=>body});});}};
 vm.runInNewContext(fs.readFileSync('public/durable-session.js','utf8'),context);
 return {nodes,root,renders,context,calls:()=>calls,resolve:body=>resolve(body)};
}
const session={session:{id:'saved',items:[{itemCode:'saved:1'}],search_fields:{k:'収納ボックス',min:'500'},platforms:[]}};
async function responseReady(){for(let i=0;i<5;i++)await Promise.resolve();}
test('durable restoration uses display-only render and preserves the saved keyword',async()=>{
 const x=setup(),p=x.root.UrenaviDurable.restoreActive();await responseReady();x.resolve(session);assert.equal(await p,true);
 assert.equal(x.renders.length,1);assert.equal(x.renders[0].options?.autoAi,false);assert.equal(x.renders[0].options?.restored,true);assert.equal(x.renders[0].options?.keyword,'収納ボックス');
});
test('returning to an existing result never replaces it or restarts generation',async()=>{
 const x=setup();x.nodes.res.children=[{}];assert.equal(await x.root.UrenaviDurable.restoreActive(),false);assert.equal(x.calls(),0);assert.equal(x.renders.length,0);
});
test('late saved-session response cannot overwrite a search made while loading',async()=>{
 const x=setup(),p=x.root.UrenaviDurable.restoreActive();await responseReady();x.nodes.res.children=[{}];x.nodes.k.value='洗濯ネット';x.resolve(session);assert.equal(await p,false);assert.equal(x.renders.length,0);assert.equal(x.nodes.k.value,'洗濯ネット');
});
test('late restore cannot overwrite edited fields or a changed account',async()=>{
 for(const change of [x=>x.nodes.k.value='ハンディクリーナー',x=>x.nodes.userMail.textContent='other@example.test',x=>x.nodes.appRoot.style.display='none']){
  const x=setup(),p=x.root.UrenaviDurable.restoreActive();await responseReady();change(x);x.resolve(session);assert.equal(await p,false);assert.equal(x.renders.length,0);
 }
});
test('search or generation in progress prevents restoration, including after the fetch starts',async()=>{
 for(const busy of ['searching','aiQueueRunning']){
  const x=setup();x.context[busy]=true;assert.equal(await x.root.UrenaviDurable.restoreActive(),false);assert.equal(x.calls(),0);
  x.context[busy]=false;const p=x.root.UrenaviDurable.restoreActive();await responseReady();x.context[busy]=true;x.resolve(session);assert.equal(await p,false);assert.equal(x.renders.length,0);
 }
});
