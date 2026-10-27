'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {quoteBoundaryValid,validateProductType}=require('../lib/room-ai');
const {resolveLocalUnderstanding}=require('../lib/super-urenavi-router');

test('a later complete occurrence remains valid after an earlier partial occurrence',()=>{
  for(const identity of ['電気ケトル','収納ボックス','モバイルバッテリー']){
    const title=`${identity}用カバー 関連案内 ${identity} 仕様`;
    assert.equal(quoteBoundaryValid('itemName',identity,title,''),true);
    assert.equal(quoteBoundaryValid('itemCaption',identity,'',title),true);
    const raw={value:identity,source:'itemName',evidence:identity};
    assert.equal(validateProductType(raw,title,'').boundaryValid,true);
    assert.equal(quoteBoundaryValid('itemName',identity,`${identity}用カバー ${identity}専用ケース`,''),false);
  }
});
test('a complete product mention after a joined heading survives product identity validation',()=>{
  const item={itemName:'電気ケトル<期間案内> 電気ケトル 温度調節 1.0L',itemCaption:''};
  const result=resolveLocalUnderstanding(item);
  assert.equal(result?.raw?.productType?.value,'電気ケトル');
  assert.equal(result?.validation?.productType?.valid,true);
  assert.deepEqual(result.raw.features,[]);
  assert.deepEqual(result.raw.sellingPoints,[]);
});
