'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../public/app.html'),'utf8');
const clickSource=html.slice(html.indexOf("document.addEventListener('click',async e=>{\n  const resume="),html.indexOf('function legalWarning(i)'));
const requestSource=html.slice(html.indexOf('async function requestAiRoom('),html.indexOf('function aiTargetDecision('));
test('checking a restored result sends a read-only request and never resumes another product',async()=>{
 for(const initial of ['restored','pending']){
  let listener,requestOptions,batches=0;
  const button={dataset:{aiContinue:'0'},disabled:false};
  const states=new Map([[0,{state:initial}],[1,{state:'paused'}]]);
  const context=vm.createContext({document:{addEventListener(_event,fn){listener=fn;}},aiQueueRunning:false,aiRoomResults:states,lastSearchItems:[{itemCode:'selected'},{itemCode:'other'}],aiRunGeneration:1,requestAiRoom:async(_item,index,_generation,options)=>{requestOptions=options;states.set(index,{state:'done'});},runAiPreview:async()=>{batches++;},updateAiPanel:()=>{}});
  vm.runInContext(clickSource,context);
  await listener({target:{closest:selector=>selector==='[data-ai-continue]'?button:null}});
  assert.equal(requestOptions.statusOnly,initial==='restored');
  assert.equal(batches,initial==='restored'?0:1);
  assert.equal(states.get(1).state,'paused');assert.equal(button.disabled,false);
 }
});
test('the real UI request builder carries read-only intent to the existing API contract',async()=>{
 for(const statusOnly of [true,false]){
  let sent;
  const context=vm.createContext({aiGatesFullOutput:true,aiRunGeneration:1,aiRoomResults:new Map(),updateAiPanel:()=>{},AbortController,setTimeout,clearTimeout,usePurchasePlan:true,currentAppSession:{access_token:'mock'},firstImageUrl:()=> '#',RoomPreviewRequest:{run:async payload=>{sent=payload;return {status:200,data:{ok:true,pending:false,quality:{status:'ready',text:'確認済み'},resourceUsage:{calls:0}}};}},document:{querySelector:()=>null},saveSearchState:()=>{}});
  vm.runInContext(requestSource,context);
  await context.requestAiRoom({itemCode:'selected',itemName:'刺繍キット',itemCaption:'図案を印刷済み'},0,1,{statusOnly});
  assert.equal(sent.statusOnly,statusOnly?true:undefined);
  assert.equal(sent.itemCode,'selected');assert.equal(context.aiRoomResults.get(0).state,'done');
 }
});
test('restoring paused searches renders saved platforms without synthetic clicks or generation',()=>{
 const saved={items:[{itemCode:'selected'},{itemCode:'other'}],fields:{k:'保存した検索',min:'500',max:'30000',sort:'-reviewCount'},copyStates:[{state:'paused'},{state:'pending'}],platforms:['threads','instagram']};
 let clicks=0;
 const cards=saved.items.map((_item,i)=>{
  const tabs=['room','threads','instagram'].map(p=>({dataset:{p},classList:{toggle(_name,on){this.on=on;}},click(){clicks++;}}));
  const copy={textContent:''},button={dataset:{p:'room',i:String(i)},disabled:false};
  return {tabs,copy,button,querySelectorAll:()=>tabs,querySelector:selector=>selector==='.copy'?copy:selector==='.cb'?button:tabs.find(t=>selector.includes(t.dataset.p))};
 });
 const nodes={res:{children:[]},k:{value:''},min:{value:''},max:{value:''},sort:{value:''},st:{textContent:''},x:{classList:{toggle(){}}}};
 const context=vm.createContext({UrenaviReturnState:{load:()=>saved},sessionStorage:{},lastSearchItems:[],lastSearchKeyword:'',aiRoomResults:new Map(),document:{getElementById:id=>nodes[id],querySelectorAll:()=>cards},render(items){context.lastSearchItems=items;nodes.res.children=cards;for(let i=0;i<items.length;i++)context.aiRoomResults.set(i,{state:'restored'});},updateAiPanel:()=>{},postDisplay:(_item,p)=>'restored '+p,postReady:()=>false,requestAnimationFrame:()=>{},window:{scrollTo(){}},ensureAiForItem:()=>assert.fail('restoring a platform must not request generation')});
 vm.runInContext(html.slice(html.indexOf('function setItemPlatformView('),html.indexOf('function short(')),context);
 vm.runInContext(html.slice(html.indexOf('function restoreSearchState('),html.indexOf('function authDeadline(')),context);
 context.restoreSearchState('owner@example.test');
 assert.equal(clicks,0);
 assert.equal(context.aiRoomResults.get(0).state,'paused');assert.equal(context.aiRoomResults.get(1).state,'pending');
 for(let i=0;i<cards.length;i++){
  assert.equal(cards[i].button.dataset.p,saved.platforms[i]);assert.equal(cards[i].button.disabled,true);
  assert.equal(cards[i].copy.textContent,'restored '+saved.platforms[i]);
  assert.equal(cards[i].tabs.filter(t=>t.classList.on).length,1);
 }
});
