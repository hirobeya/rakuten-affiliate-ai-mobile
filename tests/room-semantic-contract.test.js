'use strict';
const assert=require('node:assert/strict');const c=require('../lib/room-semantic-contract');
function draft(type,source,text,scene='用途に合わせて選びたいときに。'){return {product:{what:type,acts_on:type,acts_on_quote:source},sentences:[{text:scene,kinds:['scene'],quotes:[source]},{text,kinds:['spec','benefit'],quotes:[source]}]};}
function review(d){return {product:{what:'supported',acts_on:'supported'},quality:Object.fromEntries(['identity','reason','scene','natural','non_redundant','room_style'].map(q=>[q,'supported'])),sentences:d.sentences.map(s=>({text:s.text,...Object.fromEntries(c.questions.map(q=>[q,'supported'])),evidenceQuotes:s.quotes,reason:'mock approval to exercise independent server veto'}))};}
for(const [type,source,text,ok] of [
 ['美顔ローラー','付属品 ポーチ・クリーンクロス','清潔に保てる美顔ローラー。',false],
 ['ペットベッド','カバーだけ洗濯機で洗える','本体を丸ごと洗濯機で洗えるペットベッド。',false],
 ['バイクグローブ','長時間でも快適な操作をサポート','手が疲れにくいバイクグローブ。',false],
 ['収納ベンチ 2人掛け','収納ベンチ 2人掛け','2人掛けの収納ベンチです。',true],
 ['靴下','抗菌防臭加工を施した靴下','抗菌防臭加工の靴下です。',true],
 ['収納ベンチ','座面の下に収納できる','座面の下に収納できる収納ベンチです。',true],
 ['収納ボックス','幅30cm','幅30mmの収納ボックスです。',false],
 ['収納ベンチ','本体サイズ 幅120×奥行37×高さ40cm','幅120cmの収納ベンチです。',true],
 ['モップハンガー','外寸（幅）[mm]：536●外寸（奥）[mm]：505','幅536mm、奥行505mmのモップハンガーです。',true],
 ['収納ベンチ','本体サイズ 幅120×奥行37×高さ40cm','幅120mmの収納ベンチです。',false],
 ['収納ボックス','幅30cm、容量40L','高さ40cmの収納ボックスです。',false],
 ['充電器','約4時間の急速充電で、毎日の準備もスムーズ','約4時間の急速充電で、準備がすぐに完了します。',false],
 ['充電器','約4時間の急速充電で、毎日の準備もスムーズ','約4時間で充電できる充電器です。',true],
 ['掃除手袋','はめてすぐ使えます。洗った後は素早く乾きます。','洗った後すぐに乾く掃除手袋です。',false],
 ['防臭袋','防臭袋','一日中ニオイが気にならない防臭袋です。',false],
 ['グローブ','非防水','防水のグローブです。',false]
]){const item={itemName:type,itemCaption:source};const d=draft(type,source,text);if(type==='グローブ')d.sentences[1].quotes=['防水'];assert.equal(c.publication(item,d,review(d)).status,ok?'ready':'blocked',text);}
const item={itemName:'電気ケトル',itemCaption:'忙しい朝にカップ1杯分が約85秒で沸騰する。'};const d=draft('電気ケトル','カップ1杯分が約85秒で沸騰する','電気ケトルはカップ1杯分を約85秒で沸かせます。','忙しい朝にお湯を用意したいときに。');const r=review(d);r.sentences[0].evidenceQuotes=[item.itemCaption];let out=c.publication(item,d,r);assert.equal(out.status,'ready');assert.equal(out.additionalEvidence.length,1);assert.equal(out.additionalEvidence[0].source,'caption');
// A complete single sentence still receives every factual and quality check.
const single={product:d.product,sentences:[{text:'忙しい朝にお湯を用意したいとき、カップ1杯分を約85秒で沸かせる電気ケトルです。',kinds:['scene','spec','benefit'],quotes:[item.itemCaption]}]};
assert.equal(c.publication(item,single,review(single)).status,'ready');
const singleUnclear=review(single);singleUnclear.sentences[0].conditions='unclear';assert.equal(c.publication(item,single,singleUnclear).status,'blocked');
for(const malformed of [r.sentences.slice(1),[...r.sentences,r.sentences[0]],r.sentences.map((x,i)=>i?x:{...x,part:'unclear'}),r.sentences.map(x=>({...x,evidenceQuotes:['架空の引用']}))])assert.equal(c.publication(item,d,{...r,sentences:malformed}).status,'blocked');
// Classification does not exempt any of the five questions.
const bodyItem={itemName:'ペットブラシ',itemCaption:'ペットの体の毛をとかすブラシ'};const body=draft('ペットブラシ',bodyItem.itemCaption,'床に落ちた毛を取れるブラシです。');body.sentences[1].kinds=['scene'];const wrong=review(body);wrong.sentences[1].target='not_supported';assert.equal(c.publication(bodyItem,body,wrong).status,'blocked');
console.log('room-semantic-contract: PASS (known counterexamples, source-added proof, no missing-question bypass)');
