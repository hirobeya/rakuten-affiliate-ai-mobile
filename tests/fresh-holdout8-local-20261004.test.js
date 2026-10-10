'use strict';

const test=require('node:test');
const fixtures=require('../public/room-holdout8-evaluation-fixtures.json');
const {localZeroCall}=require('../api/room-ai-v3');

test('eighth untouched holdout - record zero-call result as-is',()=>{
  const rows=fixtures.map(f=>{
    const result=localZeroCall(f.item);
    return {
      id:f.id,
      category:f.category,
      zeroCall:Boolean(result),
      productType:result?.productType?.specific||null,
      groqCalls:result?.groq?.totalCalls??null,
      text:result?.quality?.text||null
    };
  });
  const zeroCallCount=rows.filter(x=>x.zeroCall).length;
  console.log('FRESH_HOLDOUT8_LOCAL_20261004 '+JSON.stringify({
    total:rows.length,
    zeroCallCount,
    groqNeededCount:rows.length-zeroCallCount,
    zeroCallRate:zeroCallCount/rows.length,
    rows
  }));
});
