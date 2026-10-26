'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {inspect,publication}=require('../lib/room-semantic-contract');
const record=require('../docs/measurements/room-copy-20261027-ipow-compact.json').records[0];
const item={itemName:record.item_name,itemCaption:record.item_caption_normalized};
test('recorded asterisk source dimensions support equivalent multiplication-sign lengths',()=>{
  assert.ok(record.state.quality.reasons.some(x=>x.rule==='measurement_without_evidence'));
  const actual=inspect(item,record.state.draft);
  assert.equal(actual.ok,true,JSON.stringify(actual.failures));
  assert.equal(publication(item,record.state.draft,null).status,'blocked','machine equivalence cannot replace complete AI review');
});
test('dimension equivalence still rejects changed units, unsupported values, and non-length inheritance',()=>{
  for(const text of ['角型は60×50mmの洗濯ネットです。','角型は61×50cmの洗濯ネットです。','角型は60×50kgの洗濯ネットです。']){
    const draft=structuredClone(record.state.draft);
    draft.sentences[0].text=text;
    assert.equal(inspect(item,draft).ok,false,text);
  }
  const source='内容量は60*50kgです。';
  const draft={product:{what:'荷物',acts_on:'荷物',acts_on_quote:source},sentences:[{text:'60kgの荷物です。',kinds:['spec'],quotes:[source]}]};
  assert.ok(inspect({itemName:'荷物',itemCaption:source},draft).failures.some(x=>x.rule==='measurement_without_evidence'));
});
