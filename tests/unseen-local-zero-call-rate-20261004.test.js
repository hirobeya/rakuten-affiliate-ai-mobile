'use strict';

const test=require('node:test');
const unseen=require('./fixtures/room-unseen-products.json');
const {localZeroCall}=require('../api/room-ai-v3');

test('measure generalized zero-call rate on reviewed unseen products without tuning',()=>{
  const rows=unseen.map(row=>{
    const result=localZeroCall(row.item||{});
    return {
      id:row.id,
      category:row.category,
      zeroCall:Boolean(result),
      productType:result?.productType?.specific||null,
      text:result?.quality?.text||null
    };
  });
  const zeroCallCount=rows.filter(x=>x.zeroCall).length;
  const report={
    total:rows.length,
    zeroCallCount,
    groqNeededCount:rows.length-zeroCallCount,
    zeroCallRate:rows.length?Number((zeroCallCount/rows.length).toFixed(4)):0,
    rows
  };
  console.log('UNSEEN_LOCAL_ZERO_CALL_RATE_20261004 '+JSON.stringify(report));
});
