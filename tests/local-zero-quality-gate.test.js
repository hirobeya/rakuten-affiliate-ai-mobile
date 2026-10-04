'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {localZeroCall,extractLiteralSpecs}=require('../api/room-ai-v3');

test('numeric unit attached to a component noun is not sliced into a standalone fact',()=>{
  const specs=extractLiteralSpecs({itemName:'自動給餌器 スマホ操作 カメラ付き 5gプロペラ付き'});
  assert.equal(specs.some(x=>x.quote==='5g'),false);
});

test('origin-only metadata cannot complete a zero-call ROOM post',()=>{
  const result=localZeroCall({
    itemCode:'quality:origin-only',
    itemName:'電子体温計 日本製',
    itemCaption:'約15秒で検温。前回値メモリ付き。',
    itemPrice:2200
  });
  assert.equal(result,null);
});

test('equivalent volume spellings are published only once',()=>{
  const result=localZeroCall({
    itemCode:'quality:volume-dedupe',
    itemName:'電気ケトル 1.2L 1200ml',
    itemCaption:'',
    itemPrice:3759
  });
  assert.ok(result);
  const values=result.attributes.map(x=>x.quote);
  assert.equal(values.filter(x=>x==='1.2L'||x==='1200ml').length,1);
  const text=result.quality.text;
  assert.equal((text.match(/1\.2L/g)||[]).length+(text.match(/1200ml/g)||[]).length,1);
});
