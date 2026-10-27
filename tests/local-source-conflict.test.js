'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const structured=require('../public/structured-room-copy');
const {localZeroCall}=require('../api/room-ai-v3');

test('local server and browser reject negated source facts across caption and catchcopy',()=>{
  const cases=[
    ['コードレス 掃除機','コードレス非対応。'],
    ['折りたたみ 収納ボックス','折りたたみ不可。'],
    ['キャスター付き 収納ボックス','キャスター付きではありません。'],
    ['洗濯ネット 型崩れ防止','型崩れ防止不可。']
  ];
  for(const [itemName,negative]of cases){
    const baseline=localZeroCall({itemName,itemCaption:'',catchcopy:''});
    if(itemName==='洗濯ネット 型崩れ防止'||itemName==='折りたたみ 収納ボックス')assert.equal(baseline,null,'label-only text is not a purchase reason');
    else assert.equal(baseline?.quality?.status,'ready',itemName+' baseline');
    for(const field of ['itemCaption','catchcopy']){
      const item={itemName,itemCaption:'',catchcopy:'',[field]:negative};
      assert.equal(localZeroCall(item),null,itemName+' '+field);
      const feature=negative.replace(/非対応|不可|ではありません|。/g,'');
      assert.equal(structured.hasSourceFactConflict(item,[{quote:feature}]),true,'conflict must be detected even when quality already defers');
      assert.equal(structured.assess(item).ready,false,itemName+' browser '+field);
    }
  }
});
test('unrelated negative condition does not erase a grounded purchase reason',()=>{
  const item={itemName:'コードレス 掃除機',itemCaption:'紙パックは不要。',catchcopy:'付属ブラシは洗濯不可。'};
  assert.equal(structured.assess(item).ready,true);
  assert.equal(localZeroCall(item)?.quality?.status,'ready');
});
test('trailing negative predicates in either supplementary source retain refusal',()=>{
  for(const field of ['itemCaption','catchcopy']){
    const item={itemName:'コードレス 掃除機',itemCaption:'',catchcopy:'',[field]:'コードレスできません。'};
    assert.equal(localZeroCall(item),null);
    assert.equal(structured.hasSourceFactConflict(item,[{quote:'コードレス'}]),true);
  }
});
