'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('public/app.html','utf8');const source=html.slice(html.indexOf('async function requestAiRoom('),html.indexOf('function aiTargetDecision(item)'));
function setup(){
 const item={itemCode:'shop:a',itemName:'A',itemCaption:'原文  全文',catchcopy:'原文の見出し'};let resolve,calls=0,payload;
 const c={aiGatesFullOutput:true,aiRunGeneration:0,usePurchasePlan:true,aiRoomResults:new Map(),lastSearchItems:[item],currentAppSession:null,AbortController,setTimeout:()=>1,clearTimeout(){},firstImageUrl:()=> '#',updateAiPanel(){},saveSearchState(){},document:{documentElement:{dataset:{completedCoreOnly:'true'}},querySelector:()=>null},RoomPreviewRequest:{run:async p=>{calls++;payload=p;return new Promise(r=>{resolve=r;});}}};vm.createContext(c);vm.runInContext(source,c);return {c,item,resolve:r=>resolve(r),calls:()=>calls,payload:()=>payload};
}
test('restored actual completed request preserves raw fields and discards late product/account responses',async()=>{
 for(const change of ['generation','product']){
  const x=setup(),pending=x.c.requestAiRoom(x.item,0,0);assert.equal(x.calls(),1);assert.equal(x.payload().itemCaption,x.item.itemCaption);assert.equal(x.payload().catchcopy,x.item.catchcopy);assert.equal(x.payload().completedCoreOnly,true);
  if(change==='generation')x.c.aiRunGeneration++;
  x.c.lastSearchItems=[{...x.item,itemCode:'shop:b'}];x.c.aiRoomResults=new Map([[0,{state:'other_product'}]]);
  x.resolve({status:200,data:{ok:true,quality:{text:'old A'}}});await pending;assert.equal(x.c.aiRoomResults.get(0).state,'other_product');
 }
});
test('restored completed request stops on missing original fields, incomplete responses and 429',async()=>{
 let x=setup();delete x.item.catchcopy;await x.c.requestAiRoom(x.item,0,0);assert.equal(x.calls(),0);assert.equal(x.c.aiRoomResults.get(0).state,'error');
 for(const status of [202,429,503]){x=setup();const p=x.c.requestAiRoom(x.item,0,0);x.resolve({status,data:{ok:false,pending:status===202}});await p;assert.equal(x.c.aiRoomResults.get(0).state,status===202?'pending':'error');assert.equal(x.calls(),1);}
});
