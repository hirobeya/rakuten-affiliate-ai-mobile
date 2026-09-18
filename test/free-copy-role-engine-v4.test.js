const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function load(){
  const document={createElement(){return {textContent:''};},head:{appendChild(){}}};
  const window={document,Intl};
  const ctx=vm.createContext({window,Intl,console});
  vm.runInContext(fs.readFileSync('public/pain-copy.js','utf8'),ctx);
  vm.runInContext(fs.readFileSync('public/pain-copy-refine.js','utf8'),ctx);
  vm.runInContext(fs.readFileSync('public/pain-copy-context-fix.js','utf8'),ctx);
  return window.UrenaviPainCopy;
}

test('miso container gets storage-specific copy, not generic time-saving copy',()=>{
  const api=load();
  const item={
    itemName:'RISU リス 漬物用品 GSIS430 みそ容器 6型 ベージュ 家庭用品 キッチン用品 調理器具',
    catchcopy:'使いやすい保存容器',
    itemCaption:'毎日の作業を簡単に、時短にも便利なキッチン用品',
    itemPrice:2510,reviewCount:14,reviewAverage:4.7
  };
  const copy=api.makeRoomCopy(item,'便利グッズ');
  assert.match(copy,/味噌|みそ|漬物|保存/);
  assert.doesNotMatch(copy,/毎日の作業を時短したい|日常のちょっとした面倒/);
});

test('waffle maker gets baking copy, not generic time-saving copy',()=>{
  const api=load();
  const item={
    itemName:'パール金属 D-6540 おやつDEっSE2 ふっ素加工ワッフルメーカー ワッフル お菓子作り スイーツ パン 専用 2個同時',
    catchcopy:'2個同時に焼ける',
    itemCaption:'簡単 時短 手軽 便利 おやつ作り',
    itemPrice:2600,reviewCount:4,reviewAverage:4.8
  };
  const copy=api.makeRoomCopy(item,'便利グッズ');
  assert.match(copy,/ワッフル|おやつ|焼き/);
  assert.doesNotMatch(copy,/毎日の作業を時短したい|日常のちょっとした面倒/);
});

test('vague convenience words in description do not define unknown product role',()=>{
  const api=load();
  const ctx=api.painContext('XYZ 専用器具 500','便利グッズ','簡単 時短 手軽 便利 毎日ラク');
  assert.doesNotMatch(ctx.audience,/日常のちょっとした面倒/);
});
