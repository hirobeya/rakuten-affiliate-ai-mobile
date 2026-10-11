'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const html=fs.readFileSync(require.resolve('../public/app.html'),'utf8');
const begin=html.indexOf('function activeAiProgress()'),end=html.indexOf('async function ensureAiForItem',begin);
function context(outcomes){
 const items=[{itemName:'A'},{itemName:'B'},{itemName:'C'}],calls=[];
 const c={aiGatesFullOutput:true,aiQueueRunning:false,aiBatchPauseRequested:false,aiRunGeneration:0,aiRoomResults:new Map(),aiRoomReviews:new Map(),postCache:new Map(),lastSearchItems:items,aiTargetDecision:()=>({callAi:true}),updateAiPanel(){},document:{getElementById:()=>null},setTimeout:fn=>{fn();},requestAiRoom:async(_,index)=>{calls.push(index);c.aiRoomResults.set(index,outcomes.shift()||{state:'done',data:{}});}};
 vm.createContext(c);vm.runInContext(html.slice(begin,end),c);return {c,items,calls};
}
test('batch pauses on incomplete verification and does not resume automatically after auth/visibility',async()=>{
 const {c,items,calls}=context([{state:'pending',data:{retryAfterMs:60000}}]);await c.runAiPreview(items);
 assert.deepEqual(calls,[0]);assert.equal(c.aiRoomResults.get(1).state,'paused');assert.equal(c.aiRoomResults.get(2).state,'paused');
 c.resumeActiveAiQueue();assert.deepEqual(calls,[0]);
 c.aiRoomResults.set(0,{state:'done',data:{}});await c.runAiPreview(items,{resume:true});assert.deepEqual(calls,[0,1,2]);
});
test('provider 429 terminates all remaining products with no automatic follow-up',async()=>{
 const {c,items,calls}=context([{state:'error',status:429}]);await c.runAiPreview(items);assert.deepEqual(calls,[0]);assert.equal(c.aiRoomResults.get(1).status,429);assert.equal(c.aiRoomResults.get(2).status,429);c.resumeActiveAiQueue();assert.deepEqual(calls,[0]);
});
test('starting again while a batch is active dispatches no duplicate product request',async()=>{
 const {c,items,calls}=context([]);c.aiQueueRunning=true;await c.runAiPreview(items);assert.deepEqual(calls,[]);
});

test('manual pause preserves completed product and resumes only unprocessed products',async()=>{
 const {c,items,calls}=context([]);const request=c.requestAiRoom;c.requestAiRoom=async(...args)=>{await request(...args);c.aiBatchPauseRequested=true;};await c.runAiPreview(items);assert.deepEqual(calls,[0]);assert.equal(c.aiRoomResults.get(0).state,'done');assert.equal(c.aiRoomResults.get(1).state,'paused');c.aiBatchPauseRequested=false;c.requestAiRoom=request;await c.runAiPreview(items,{resume:true});assert.deepEqual(calls,[0,1,2]);
});
test('429 still stops remaining items when manual pause was requested simultaneously',async()=>{const {c,items,calls}=context([{state:'error',status:429}]);const request=c.requestAiRoom;c.requestAiRoom=async(...args)=>{await request(...args);c.aiBatchPauseRequested=true;};await c.runAiPreview(items);assert.deepEqual(calls,[0]);assert.equal(c.aiRoomResults.get(1).status,429);});
