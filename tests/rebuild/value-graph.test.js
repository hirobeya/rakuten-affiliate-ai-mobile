'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {sourceSentences,candidateClaims}=require('../../lib/urenavi-core/value-graph');
const source='【収納ベンチ】\n座部を上げると、内部に物を収納できます。\n高さ40cmです。';
const item={itemName:'収納ベンチ 木製 幅60cm',identity:'収納ベンチ',itemCaption:source};
test('retains exact original UTF-16 source evidence for complete use relation',()=>{
 const rows=sourceSentences(source);
 assert.ok(rows.some(r=>source.slice(r.start,r.end)===r.quote&&r.quote.includes('座部を上げると')));
 const c=candidateClaims(item);
 assert.equal(c.length,1);
 assert.equal(source.slice(c[0].sourceSpan.start,c[0].sourceSpan.end),c[0].quote);
 assert.match(c[0].body,/座部を上げると、内部に物を収納できます/);
 assert.equal(c[0].evidenceRelation,'explicit_source_use_relation');
});
test('does not convert bare specifications into invented benefits',()=>{
 assert.deepEqual(candidateClaims({...item,itemCaption:'【収納ベンチ】\n幅60cmです。\n高さ40cmです。'}),[]);
});
test('does not take unrelated or unscoped descriptions',()=>{
 const withoutHeading=candidateClaims({...item,itemCaption:'座部を上げると、内部に物を収納できます。'});
 assert.deepEqual(withoutHeading,[]);
 const related=candidateClaims({...item,itemCaption:'【収納ベンチ】\n関連商品は、座部を上げると収納できます。'});
 assert.deepEqual(related,[]);
});
test('rejects negative claims and unsafe or seller promotional assertions',()=>{
 for(const q of [
  '【収納ベンチ】\n座部を上げると、内部に物を収納できません。',
  '【収納ベンチ】\n座部を上げると、絶対に片付けが楽になります。',
  '【収納ベンチ】\n弊社が工夫することで、収納できます。'
 ]) assert.deepEqual(candidateClaims({...item,itemCaption:q}),[]);
});
test('supports distinct product domain using explicit operation and benefit only',()=>{
 const x=candidateClaims({itemName:'シャツ用洗濯ネット',identity:'シャツ用洗濯ネット',itemCaption:'【シャツ用洗濯ネット】\nシャツを巻いて洗うことで、洗濯中のかたよりを抑えます。'});
 assert.equal(x.length,1);
 assert.match(x[0].body,/シャツを巻いて洗うことで/);
});
