'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync('public/app.html','utf8');
function setup({status=404,code='completed_core_cache_miss',failure=null,completedOnly=true}={}){
 const item={itemCode:'synthetic:1',itemName:'検証商品',itemCaption:'原文',catchcopy:''},states=[];let calls=0;
 const context={Map,AbortController,setTimeout,clearTimeout,Date,aiGatesFullOutput:true,aiRunGeneration:1,usePurchasePlan:true,currentAppSession:null,
  lastSearchItems:[item],aiRoomResults:new Map(),document:{documentElement:{dataset:{completedCoreOnly:String(completedOnly)}},querySelector:()=>null},
  firstImageUrl:()=>'#',updateAiPanel(){states.push(context.aiRoomResults.get(0));},saveSearchState(){},
  RoomPreviewRequest:{async run(payload,options){calls++;assert.equal(payload.completedCoreOnly,completedOnly?true:undefined);options.onStage('generation');if(failure)throw failure;return {status,data:{message:code}};}}};
 vm.createContext(context);
 const start=html.indexOf('async function requestAiRoom('),end=html.indexOf('function aiTargetDecision(',start);
 vm.runInContext(html.slice(start,end),context);
 return {item,context,states,calls:()=>calls,run:()=>context.requestAiRoom(item,0,1),result:()=>context.aiRoomResults.get(0)};
}
test('missing completed copy is shown as not yet saved, never as a failed product review or generated fallback',async()=>{
 const x=setup();await x.run();assert.equal(x.calls(),1);assert.equal(x.result().state,'error');assert.match(x.result().message,/まだ保存されていません/);assert.ok(!x.result().message.includes('選ぶ理由'));assert.ok(x.states.filter(s=>s.state==='loading').every(s=>s.message==='保存済み投稿文を確認中…'));assert.equal(x.result().data.resourceUsage,null);
});
test('authorization, rejected saved result and service outage remain distinct stopped reads',async()=>{
 for(const [status,code,match] of [[403,'private detail',/利用許可/],[409,'completed_core_result_rejected',/安全に確認できない/],[503,'synthetic-private-detail',/取得できません/],[404,'unrelated-not-found',/取得できません/]]){
  const x=setup({status,code});await x.run();assert.equal(x.calls(),1);assert.equal(x.result().state,'error');assert.match(x.result().message,match);assert.ok(!x.result().message.includes('private'));assert.equal(x.result().data.resourceUsage,null);
 }
});
test('network/timeout failure never claims a shortened post exists and never retries',async()=>{
 for(const failure of [new TypeError('synthetic-private-detail'),Object.assign(Error('timeout'),{name:'AbortError'})]){const x=setup({failure});await x.run();assert.equal(x.calls(),1);assert.equal(x.result().state,'error');assert.match(x.result().message,/投稿文は表示していません/);assert.ok(!x.result().message.includes('短文表示'));}
});
test('ordinary generation route retains its existing error message',async()=>{const x=setup({completedOnly:false,status:409,code:'completed_core_result_rejected'});await x.run();assert.equal(x.calls(),1);assert.match(x.result().message,/選ぶ理由/);});
