const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

function load(){
  const head={appendChild(){}};
  const document={
    createElement(){return {textContent:''};},
    head
  };
  const window={document,Intl};
  const context=vm.createContext({window,Intl,console});
  vm.runInContext(fs.readFileSync('public/pain-copy.js','utf8'),context);
  vm.runInContext(fs.readFileSync('public/pain-copy-context-fix.js','utf8'),context);
  return window.UrenaviPainCopy;
}

test('quail egg cutter is classified as an egg tool, not a cardboard opener',()=>{
  const api=load();
  const ctx=api.painContext('【日本製】うずら卵割り器 プッチ オレンジ 関市製 便利グッズ 卵カッター','便利グッズ');
  assert.match(ctx.audience,/うずら卵/);
  assert.doesNotMatch(ctx.hook,/段ボール|ハサミ|荷物/);
});

test('generic cutter word alone does not imply cardboard opening',()=>{
  const api=load();
  const ctx=api.painContext('野菜カッター 千切り 調理器','段ボール カッター');
  assert.doesNotMatch(ctx.hook,/段ボール|荷物|ハサミ/);
});

test('search keyword alone cannot assign an unrelated product use',()=>{
  const api=load();
  const ctx=api.painContext('シンプル収納ボックス ふた付き','段ボール カッター');
  assert.doesNotMatch(ctx.hook,/段ボール|荷物|ハサミ/);
});

test('hair brush is not classified as a cleaning brush',()=>{
  const api=load();
  const ctx=api.painContext('ヘアブラシ レディース 静電気防止','掃除ブラシ');
  assert.doesNotMatch(ctx.hook,/毎日の掃除/);
});

test('camera filter is not classified as a range hood filter',()=>{
  const api=load();
  const ctx=api.painContext('カメラ レンズ フィルター 67mm','換気扇 フィルター');
  assert.doesNotMatch(ctx.hook,/換気扇|ベタベタ掃除/);
});

test('microwave rack is not classified as a microwave cooking tool',()=>{
  const api=load();
  const ctx=api.painContext('電子レンジ台 レンジラック キッチン収納棚','電子レンジ');
  assert.doesNotMatch(ctx.bridge,/電子レンジで手軽に調理/);
});
