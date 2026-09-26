'use strict';

const assert=require('node:assert/strict');
const {logAiRoute}=require('../api/room-ai');

const originalLog=console.log;
const rows=[];
console.log=(...args)=>rows.push(args);
try{
  const cache=logAiRoute('cache',{groqCalls:0,cacheStatus:'hit',mode:'simple'});
  const text=logAiRoute('text',{groqCalls:1,cacheStatus:'miss',mode:'simple'});
  const image=logAiRoute('image',{groqCalls:2,cacheStatus:'miss',mode:'simple'});

  assert.equal(cache.route,'cache');
  assert.equal(cache.groqCalls,0);
  assert.equal(text.route,'text');
  assert.equal(text.groqCalls,1);
  assert.equal(image.route,'image');
  assert.equal(image.groqCalls,2);
  assert.equal(rows.length,3);
  for(const row of rows){
    assert.equal(row[0],'urenavi ai route');
    const payload=JSON.parse(row[1]);
    assert.ok(['cache','text','image'].includes(payload.route));
    assert.ok(Number.isInteger(payload.groqCalls));
  }
}finally{
  console.log=originalLog;
}

console.log('ai-route-metrics.test.js: PASS');
