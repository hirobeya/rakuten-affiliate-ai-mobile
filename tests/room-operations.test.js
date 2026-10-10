'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createStore,roomUrl}=require('../public/room-operations');
function memory(){const rows=new Map();return {getItem:k=>rows.get(k)||null,setItem:(k,v)=>rows.set(k,v)};}
const input={type:'like_visit',url:'https://room.rakuten.co.jp/room_example/1234567890',name:'相手'};
test('record only after opening, survive reload, reject duplicate completion, allow explicit undo',()=>{
 const storage=memory(),store=createStore(storage,'a@example.test');
 const row=store.add(input,'2026-10-10T23:00:00Z');
 assert.throws(()=>store.transition(row.id,'complete'),/開いて/);
 store.transition(row.id,'open');
 const reload=createStore(storage,'a@example.test');
 assert.equal(reload.queue()[0].state,'opened');
 reload.transition(row.id,'complete','2026-10-10T23:01:00Z');
 assert.equal(reload.summary('2026-10-10T23:10:00Z').today,1);
 assert.throws(()=>reload.transition(row.id,'complete'),/開いて/);
 reload.transition(row.id,'undo');
 assert.equal(reload.summary('2026-10-10T23:10:00Z').today,0);
 assert.equal(reload.queue()[0].state,'pending');
});
test('return activity priority, normalized duplicates, next-day likes and lifetime follow dedupe',()=>{
 const store=createStore(memory(),'owner');
 const row=store.add(input,'2026-10-10T23:00:00Z');
 assert.throws(()=>store.add({...input,url:input.url+'/?tracking=1',type:'like_return'}),/登録済み/);
 store.add({...input,type:'follow_return'},'2026-10-10T23:01:00Z');
 assert.equal(store.queue()[0].type,'follow_return');
 store.transition(row.id,'open');store.transition(row.id,'complete','2026-10-10T23:02:00Z');
 assert.throws(()=>store.add(input,'2026-10-10T23:03:00Z'),/実施済み/);
 assert.doesNotThrow(()=>store.add(input,'2026-10-11T23:03:00Z'));
 const follow=store.queue().find(x=>x.type==='follow_return');
 store.transition(follow.id,'open');store.transition(follow.id,'complete');
 assert.throws(()=>store.add({...input,type:'follow_visit',url:'https://room.rakuten.co.jp/room_example/items'},'2026-11-11T23:03:00Z'),/実施済み/);
});
test('owner isolation, storage failure leaves prior data intact, corrupted data is not overwritten',()=>{
 const storage=memory(),a=createStore(storage,'A@example.test'),b=createStore(storage,'b@example.test');
 a.add(input);assert.equal(b.read().candidates.length,0);
 const before=a.exportData();storage.setItem=()=>{throw new Error('quota');};
 assert.throws(()=>a.transition(a.queue()[0].id,'open'),/quota/);
 assert.equal(a.exportData(),before);
 const broken={getItem:()=>'{',setItem:()=>assert.fail('must preserve corrupt backup')};
 assert.throws(()=>createStore(broken,'owner').add(input),/読み込めません/);
});
test('block unsafe URLs, lookalike hosts, credentials and unsupported paths',()=>{
 for(const url of ['javascript:alert(1)','https://room.rakuten.co.jp.evil.test/room_a/','https://room.rakuten.co.jp@evil.test/room_a/','http://room.rakuten.co.jp/room_a/','https://room.rakuten.co.jp/search/','https://room.rakuten.co.jp/room_a/%22onclick=1','https://u@room.rakuten.co.jp/room_a/'])assert.throws(()=>roomUrl(url));
 assert.equal(roomUrl(input.url+'?x=1#abc'),input.url+'/');
});
