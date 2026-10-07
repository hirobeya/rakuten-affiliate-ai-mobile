'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
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
      text:result?.quality?.text||null,
      arbitration:result?.local?.arbitration||null
    };
  });

  // Generic safety regressions discovered by the untouched reviewed set:
  // u02 has a related-product 150kg value in the caption; the current item is about 80kg.
  // Its title also says "収納 ベンチ" before the later "収納ボックス", so the earlier
  // grounded product identity must win without adding a product-specific branch.
  // The ROOM hook is still free to lead with a useful scene, so require the body to retain
  // the resolved identity rather than forcing every post to start with the product noun.
  // u03 contains H1,375mm in a noisy caption and must never publish a sliced "375mm" fact.
  const storageBench=rows.find(x=>x.id==='u02');
  const mopHanger=rows.find(x=>x.id==='u03');
  if(storageBench?.zeroCall){
    assert.equal(storageBench?.productType,'収納ベンチ');
    assert.ok(String(storageBench?.text||'').includes('収納ベンチ'));
  }
  assert.ok(!String(storageBench?.text||'').includes('150kg'));
  assert.ok(!String(mopHanger?.text||'').includes('375mm'));

  // u12 registration metadata must never become ROOM copy.
  const petBed=rows.find(x=>x.id==='u12');
  assert.ok(!/登録番号|登録第?\s*\d+号|第\s*\d+号/.test(String(petBed?.text||'')));

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
