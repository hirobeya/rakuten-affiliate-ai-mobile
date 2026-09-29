'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {verifyPost,groundedFacts,buildGroundedSelectionLine}=require('../lib/room-post-verifier-v1');

test('unsafe shaver inferences are removed but grounded purchase criteria remain',async()=>{
  const source='電気シェーバー メンズ 回転式 6枚刃 IPX4 約92g USB充電\n回転式6枚刃。商品重量約92g。防水性能IPX4。USB充電に対応。';
  const post='メンズ用の電気シェーバー。\n重量は約92gです。\n約92gなので疲れにくく持ち運びやすいです。\nIPX4なのでシャワー中でも安心です。\nUSB充電なので旅行先でも便利です。';
  const result=await verifyPost({sourceText:source,postText:post,productSummary:'電気シェーバー',factsUsed:['回転式6枚刃','商品重量約92g','防水性能IPX4','USB充電に対応']});
  assert.doesNotMatch(result.postText,/疲れ|持ち運びやす|シャワー|安心|旅行先/);
  assert.match(result.postText,/6枚刃/);
  assert.match(result.postText,/約92g/);
  assert.match(result.postText,/IPX4/);
  assert.match(result.postText,/USB充電/);
  assert.match(result.postText,/まとめて確認できます/);
  assert.equal(result.raw.grounded_selection,true);
});

test('promo and identity fragments are not used as grounded purchase facts',()=>{
  const source='電気ケトル 0.8L 1℃単位 温度設定 USB充電 送料無料 楽天ランキング1位';
  const facts=groundedFacts(['電気ケトル','0.8L','1℃単位','温度設定','送料無料','楽天ランキング1位'],source,'電気ケトル');
  assert.ok(facts.includes('1℃単位'));
  assert.ok(facts.includes('0.8L'));
  assert.ok(facts.some(x=>/USB/.test(x)));
  assert.ok(!facts.some(x=>/送料無料|ランキング|電気ケトル/.test(x)));
});

test('selection fallback requires at least two exact grounded facts',()=>{
  const line=buildGroundedSelectionLine({sourceText:'収納ボックス 50L',productSummary:'収納ボックス',factsUsed:['50L']});
  assert.equal(line,'');
});

test('already useful safe copy is not padded with fallback boilerplate',async()=>{
  const source='電気ケトル 0.8L 50〜100℃ 1℃単位 温度設定\n容量0.8L。50〜100℃の範囲を1℃単位で温度設定できます。';
  const post='0.8Lの電気ケトル。\n50〜100℃の範囲を1℃単位で温度設定できます。\n毎回同じ温度設定に合わせたい時に使いやすいです。';
  const result=await verifyPost({sourceText:source,postText:post,productSummary:'電気ケトル',factsUsed:['0.8L','50〜100℃','1℃単位','温度設定']});
  assert.equal(result.raw.grounded_selection,false);
  assert.doesNotMatch(result.postText,/まとめて確認できます/);
});

test('kettle direct benefit cannot smuggle invented family or cookware context',async()=>{
  const source='電気ケトル 0.8L 50〜100℃ 1℃単位 温度設定 保温\n容量0.8L。50〜100℃の範囲を1℃単位で温度設定できます。';
  const post='容量0.8Lで50〜100℃の範囲を1℃単位で設定できる電気ケトルです。\n飲み物に合わせて、そのまま鍋を作らずに済みたい時に便利です。\n毎回の温度調整を自分で細かく決められるので、家族で飲む量や種類が変わっても対応しやすくなります。';
  const result=await verifyPost({sourceText:source,postText:post,productSummary:'電気ケトル',factsUsed:['電気ケトル 0.8L','50〜100℃','1℃単位','温度設定']});
  assert.doesNotMatch(result.postText,/鍋|家族/);
  assert.match(result.postText,/0.8L|1℃/);
});

test('best-fit wording is rejected when the source only provides temperature controls',async()=>{
  const source='電気ケトル 0.8L 50〜100℃ 1℃単位 温度設定 保温\n容量0.8L。50〜100℃の範囲を1℃単位で温度設定できます。';
  const post='0.8Lの電気ケトルです。\n飲み物ごとに適した温度や適温を選びたい方に。\n毎回同じ温度設定に合わせたい時に使いやすいです。';
  const result=await verifyPost({sourceText:source,postText:post,productSummary:'電気ケトル',factsUsed:['0.8L','1℃単位','温度設定']});
  assert.doesNotMatch(result.postText,/適した|適温/);
  assert.match(result.postText,/毎回同じ温度設定/);
});

test('unsupported popularity wording is removed even when temperature words overlap the source',async()=>{
  const source='電気ケトル 0.8L 50〜100℃ 1℃単位 温度設定\n容量0.8L。50〜100℃の範囲を1℃単位で温度設定できます。';
  const post='0.8Lの電気ケトルです。\n温度管理を細かく行いたい方に選んでもらえやすい一台です。';
  const result=await verifyPost({sourceText:source,postText:post,productSummary:'電気ケトル',factsUsed:['0.8L','1℃単位','温度設定']});
  assert.doesNotMatch(result.postText,/選んでもらえやすい|選ばれやすい/);
});

test('strict atoms can be recovered from source when AI facts omit a valid shaver spec',()=>{
  const source='電気シェーバー メンズ 回転式 6枚刃 IPX4 約92g USB充電\n回転式6枚刃。商品重量約92g。防水性能IPX4。USB充電に対応。';
  const facts=groundedFacts(['回転式6枚刃','約92g','USB充電'],source,'電気シェーバー');
  assert.ok(facts.some(x=>/6枚刃/.test(x)));
  assert.ok(facts.includes('IPX4'));
  assert.ok(facts.includes('約92g'));
  assert.ok(facts.some(x=>/USB/.test(x)));
});

test('long combined shaver fact is decomposed into strict source-grounded spec atoms',()=>{
  const source='電気シェーバー メンズ 回転式 6枚刃 IPX4 約92g USB充電\n回転式6枚刃。商品重量約92g。防水性能IPX4。USB充電に対応。';
  const facts=groundedFacts(['電気シェーバー メンズ 回転式 6枚刃 IPX4 約92g USB充電'],source,'電気シェーバー');
  assert.ok(facts.some(x=>/6枚刃/.test(x)));
  assert.ok(facts.includes('IPX4'));
  assert.ok(facts.includes('約92g'));
  assert.ok(facts.some(x=>/USB/.test(x)));
});
