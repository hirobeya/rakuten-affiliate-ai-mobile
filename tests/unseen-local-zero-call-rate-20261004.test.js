'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const unseen=require('./fixtures/room-unseen-products.json');
const {localZeroCall,resolveLiteralIdentity}=require('../api/room-ai-v3');
const {resolveLocalUnderstanding}=require('../lib/super-urenavi-router');
const {repeatedLiteralIdentity}=require('../lib/repeated-literal-identity');
const {evidenceBackedLeadingIdentity}=require('../lib/local-semantic-composer');
const {selectLocalIdentity}=require('../lib/local-identity-arbitrator');

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
  const mobileBattery=rows.find(x=>x.id==='u08');
  const u08=unseen.find(x=>x.id==='u08')?.item||{};
  const u08Rule=resolveLocalUnderstanding({itemName:u08.itemName,itemCaption:u08.itemCaption});
  const u08Literal=resolveLiteralIdentity(u08);
  const u08Repeated=repeatedLiteralIdentity(u08);
  const u08Semantic=evidenceBackedLeadingIdentity({itemName:u08.itemName,itemCaption:''});
  const u08Selected=selectLocalIdentity({title:u08.itemName,ruleLocal:u08Rule,literalLocal:u08Literal,repeatedLocal:u08Repeated,semanticLocal:u08Semantic});
  console.log('UNSEEN_U08_ARBITRATION '+JSON.stringify({
    rule:u08Rule?.raw?.productType?.value||null,
    literal:u08Literal?.canonicalIdentity||u08Literal?.raw?.productType?.value||null,
    repeated:u08Repeated?.canonicalIdentity||u08Repeated?.raw?.productType?.value||null,
    semantic:u08Semantic?.canonicalIdentity||u08Semantic?.raw?.productType?.value||null,
    selected:u08Selected?.canonicalIdentity||u08Selected?.raw?.productType?.value||null,
    arbitration:u08Selected?.arbitration||null
  }));
  assert.equal(mobileBattery?.productType,'モバイルバッテリー');
  assert.ok(!String(mobileBattery?.text||'').includes('スマホ充電器'));

  const fryingPan=rows.find(x=>x.id==='u09');
  if(fryingPan?.zeroCall){
    assert.ok(!/サイズも見て選ぶなら[\s\S]*20cmのサイズ表記/.test(String(fryingPan.text||'')),'size-only frying-pan angle must not publish');
    assert.match(String(fryingPan.text||''),/IH|ガス火|こびりつき|お手入れ|調理/,'local frying-pan copy must retain a real use or compatibility reason');
  }

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
