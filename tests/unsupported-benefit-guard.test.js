'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const safety=require('../public/fact-safety.js');

global.window={UrenaviFactSafety:safety};
require('../public/pain-copy.js');
require('../public/room-copy-quality.js');
const api=global.window.UrenaviPainCopy;

function guard(item,text,identity=''){
  return safety.guardUnsupportedBenefitCopy(item,text,{identity});
}

test('temperature alone cannot invent heat retention',()=>{
  const item={itemName:'ノンフライヤー 14L 温度 50-220°C 時間設定 1分-60分',itemCaption:''};
  const before='ノンフライヤーを、温度設定や保温まで見て選びたいなら。\n\n「14L」と確認できます。必要な容量に合うかを比べて選びたいときの目安になります。';
  const after=guard(item,before,'ノンフライヤー');
  assert.doesNotMatch(after,/保温/);
  assert.match(after,/ノンフライヤーの仕様を確認して選びたい方に。/);
  assert.match(after,/「14L」と確認できます。/);
});

test('weight alone cannot invent carrying benefit',()=>{
  const item={itemName:'電気シェーバー 商品重量 92g',itemCaption:''};
  const before='電気シェーバーを、持ち運ぶときの重さまで比べて選びたいなら。\n\n「商品重量 92g」と確認できます。持ち運ぶときの重さを比べて選びたい人に分かりやすい情報です。';
  const after=guard(item,before,'電気シェーバー');
  assert.doesNotMatch(after,/持ち運/);
  assert.match(after,/「商品重量 92g」と確認できます。/);
});

test('runtime benefit wording is allowed only when the source itself says it',()=>{
  const item={itemName:'電気ケトル 7段階温度調節 4時間保温',itemCaption:''};
  const before='電気ケトルを、温度設定や保温まで見て選びたいなら。';
  const after=guard(item,before,'電気ケトル');
  assert.match(after,/保温/);
});

test('verified quote is preserved when an unsupported benefit sentence is removed',()=>{
  const item={itemName:'ワイヤレスイヤホン 最大60時間再生',itemCaption:''};
  const before='「最大60時間再生」と確認できます。充電する回数をできるだけ減らして使いたいときに比べたい仕様です。';
  const after=guard(item,before,'ワイヤレスイヤホン');
  assert.equal(after,'ワイヤレスイヤホンの仕様を確認して選びたい方に。\n「最大60時間再生」と確認できます。');
});

function fixtureGenres(){
  const dir=path.join(__dirname,'fixtures');
  const files=fs.readdirSync(dir).filter(x=>/^rakuten-large-genres-20260925-.*\.json$/.test(x)).sort();
  const genres=[];
  for(const file of files){
    const data=JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'));
    for(const genre of data.genres||[]) genres.push(genre);
  }
  return genres;
}

test('fixed 780 products have no unsupported benefit after guard and emit before-after report',()=>{
  const genres=fixtureGenres();
  let total=0,generated=0,changed=0,stopped=0;
  const changedSamples=[];
  for(const genre of genres){
    for(const raw of genre.items||[]){
      total++;
      const item={...raw,catchcopy:raw.catchcopy||'',itemCaption:raw.itemCaption||'',genrePath:raw.genrePath||'',genreName:raw.genreName||genre.nameJa||''};
      const facts=api.extractFallbackTitleFacts(item);
      const before=api.buildGroundedBenefitPost(item,facts);
      if(before) generated++;
      const after=guard(item,before);
      if(before!==after){
        changed++;
        if(changedSamples.length<20) changedSamples.push({genre:genre.nameJa,itemName:item.itemName,before,after});
      }
      if(before&&!after) stopped++;
      assert.deepEqual(safety.unsupportedBenefitTerms(after,item),[],genre.nameJa+' unsupported benefit survived: '+after);
    }
  }
  assert.ok(total>=700,'expected fixed corpus >=700, got '+total);
  assert.equal(generated,112,'baseline generated count changed unexpectedly');
  assert.equal(stopped,0,'guard must preserve grounded fact output rather than blanking it');
  console.log('BENEFIT_GUARD_780_DIFF '+JSON.stringify({total,generated,changed,stopped,changedSamples}));
});
