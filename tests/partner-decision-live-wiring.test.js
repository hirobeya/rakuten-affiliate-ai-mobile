'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {advance}=require('../lib/room-semantic-engine');

test('live semantic generation infers and passes partner product type before Groq call',async()=>{
  let capturedState=null;
  const rows=new Map();
  const store={
    async loadProduct(key){return rows.get(key.itemCode)||null;},
    async saveProduct(row){rows.set(row.itemCode,{...row});}
  };
  const provider={
    model:'mock-partner-wiring',
    requiredTokens(){return 1;},
    async call(stage,item,state){
      capturedState=structuredClone(state);
      const e=new Error('stop-after-capture');
      e.status=599;
      throw e;
    }
  };
  await assert.rejects(()=>advance({
    item:{itemCode:'partner-wire-01',itemName:'山善 電気ケトル 0.8L 50-100℃ 温度調節',itemCaption:'1℃単位で温度設定できます。'},
    store,provider,consumeQuota:async()=>true,runKey:'partner-wire'
  }),/stop-after-capture/);
  assert.ok(capturedState);
  assert.equal(capturedState.stage,'generate');
  assert.equal(capturedState.partnerProductType,'電気ケトル');
});

test('unknown product type does not invent partner knowledge',async()=>{
  let capturedState=null;
  const store={async loadProduct(){return null;},async saveProduct(){}};
  const provider={
    model:'mock-partner-wiring-unknown',
    requiredTokens(){return 1;},
    async call(stage,item,state){capturedState=structuredClone(state);throw Object.assign(new Error('stop-unknown'),{status:599});}
  };
  await assert.rejects(()=>advance({
    item:{itemCode:'partner-wire-02',itemName:'未知の新商品 ABC-001',itemCaption:'新しい用途の商品です。'},
    store,provider,consumeQuota:async()=>true,runKey:'partner-wire-unknown'
  }),/stop-unknown/);
  assert.equal(capturedState.partnerProductType,'');
});
