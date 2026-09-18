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

test('corn peeler gets corn-specific copy',()=>{
  const api=load();
  const item={itemName:'とうもろこしピーラー トウモロコシ ピーラー コーンピーラー キッチン用品 調理器具 便利グッズ corn-p',itemPrice:650,reviewCount:13,reviewAverage:4.4};
  const copy=api.makeRoomCopy(item,'便利グッズ');
  assert.match(copy,/とうもろこし|コーン/);
  assert.match(copy,/芯|実/);
  assert.doesNotMatch(copy,/毎日の作業を時短したい|日常のちょっとした面倒/);
});

test('bottle opener gets opening-specific copy',()=>{
  const api=load();
  const item={itemName:'瓶オープナー 缶オープナー 蓋開け 栓抜き 省時 省力 調理器具 便利グッズ',itemPrice:1000,reviewCount:53,reviewAverage:4.0};
  const copy=api.makeRoomCopy(item,'便利グッズ');
  assert.match(copy,/フタ|栓|瓶|缶/);
  assert.match(copy,/開け/);
  assert.doesNotMatch(copy,/毎日の作業を時短したい|日常のちょっとした面倒/);
});

test('generic kitchen/category words alone never define product role',()=>{
  const api=load();
  const ctx=api.painContext('ABC123 キッチン用品 調理器具 便利グッズ','便利グッズ','簡単 時短 便利');
  assert.doesNotMatch(ctx.audience,/料理や後片付け|日常のちょっとした面倒/);
});
