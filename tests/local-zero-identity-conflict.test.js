'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {hasCompetingCompoundIdentity}=require('../lib/local-zero-identity-conflict');
const {localZeroCall}=require('../api/room-ai-v3');

test('different compounds sharing a noun core defer instead of dropping target context',()=>{
  assert.equal(hasCompetingCompoundIdentity('ペットキャリー リュック 3WAY キャリーケース 折りたたみ','キャリーケース'),true);
});

test('longer explicit compound prevents generic shortening',()=>{
  assert.equal(hasCompetingCompoundIdentity('ヘアドライヤー 大風量 ドライヤー 折りたたみ','ドライヤー'),true);
});

test('already-specific compound is not blocked by its shorter noun',()=>{
  assert.equal(hasCompetingCompoundIdentity('モバイルバッテリー バッテリー容量 10000mAh','モバイルバッテリー'),false);
});

test('later descriptive prefix ending in the same leading identity is supporting repetition, not conflict',()=>{
  assert.equal(hasCompetingCompoundIdentity(
    'キッチンペーパーホルダー 片手でカット おしゃれ 片手で切れるキッチンペーパーホルダー タワー',
    'キッチンペーパーホルダー'
  ),false);
});

test('identity-plus-accessory suffix is still treated as a competing compound',()=>{
  assert.equal(hasCompetingCompoundIdentity(
    '収納ベンチ 折りたたみ 収納ベンチカバー 防水',
    '収納ベンチ'
  ),true);
});

test('holdout8 pet carrier no longer publishes generic carry-case identity locally',()=>{
  const result=localZeroCall({
    itemCode:'identity-conflict:pet-carry',
    itemName:'ペットキャリー リュック 2匹 3WAY 猫 犬 バッグ キャリーケース カート連結 大容量 折りたたみ 洗える メッシュ',
    itemCaption:'側面と上部にメッシュ生地を使用し、中敷は取り外して洗濯できます。',
    itemPrice:0
  });
  assert.equal(result,null);
});
