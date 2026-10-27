'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {safeCaptionCandidates}=require('../lib/local-generic-reasoner');
const {localZeroCall}=require('../api/room-ai-v3');
const safety=require('../public/fact-safety');
test('section headings, metadata, and keyword fragments cannot become completed caption prose',()=>{
 for(const [identity,itemCaption] of [
  ['収納ボックス','【メーカー公式】収納ボックスは持ち手付きです。'],
  ['ポータブル電源','ポイント6 大容量を維持しつつ、ポータブル電源を軽量化。'],
  ['ハンディクリーナー','※フルチャージ3.5時間 【水洗い】ハンディクリーナーのダストカップを外せます。'],
  ['洗濯ネット','洗濯ネット ファスナー 持ち手付き メッシュ構造']
 ]){
  const rows=safeCaptionCandidates({itemName:identity,itemCaption,identity});
  assert.ok(rows.every(r=>!/[【】]|^ポイント\d+/.test(r.quote)),itemCaption);
  if(!itemCaption.startsWith('【メーカー公式】'))assert.deepEqual(rows,[],itemCaption);
  else assert.equal(rows[0].quote,'収納ボックスは持ち手付きです。');
 }
});
test('clean complete source claims remain candidates with or without final punctuation',()=>{
 for(const end of ['。','']){
  const claim='収納ボックスは持ち手を掛けて収納できます'+end;
  const rows=safeCaptionCandidates({itemName:'収納ボックス',identity:'収納ボックス',itemCaption:'【公式】仕様の紹介です。'+claim});
  assert.ok(rows.some(r=>r.quote===claim));
 }
});
test('server local-ready text must survive the unchanged final browser safety boundary',()=>{
 const item={itemName:'ペットベッド 3Dファイバー',itemCaption:'手軽に洗える3Dファイバー素材に固綿をブレンド。'};
 const result=localZeroCall(item);
 assert.ok(!result||safety.guardUnsupportedBenefitCopy(item,result.quality.text)===result.quality.text);
 const complete={itemName:'収納ボックス',itemCaption:'収納ボックスには毛布を収納できます。'};
 const ready=localZeroCall(complete);assert.equal(ready?.quality.status,'ready');
 assert.equal(safety.guardUnsupportedBenefitCopy(complete,ready.quality.text),ready.quality.text);
});
test('source table fragments, safety assurances and unclear washed parts require semantic review',()=>{
 for(const [identity,itemCaption] of [
  ['洗濯ネット','アイテム 洗濯ネット ファスナー式 カラーホワイト(収縮率はこの限りではございません。'],
  ['ポータブル電源','ポータブル電源は耐衝撃性と耐火性により防災用に使えます。'],
  ['ポータブル電源','ポータブル電源はブレーカーが落ちる心配をせず使えます。'],
  ['ペットベッド','ペットベッドはファスナー付きで、カバーを外すことができ、洗濯機に入れて簡単に洗えます。']
 ])assert.deepEqual(safeCaptionCandidates({identity,itemName:identity,itemCaption}),[],itemCaption);
 const itemCaption='ペットベッドのカバーは洗濯機で丸洗いできます。';
 assert.equal(safeCaptionCandidates({identity:'ペットベッド',itemName:'ペットベッド',itemCaption})[0]?.quote,itemCaption);
});
