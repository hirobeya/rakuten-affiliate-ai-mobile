'use strict';
const assert=require('node:assert/strict');
global.window={};
require('../public/pain-copy.js');
global.window.UrenaviFactSafety=require('../public/fact-safety.js');
require('../public/room-copy-quality.js');
const api=global.window.UrenaviPainCopy;
const cases=[
['earbuds',{itemName:'完全ワイヤレスイヤホン Bluetooth 5.3 最大60時間再生',itemCaption:'完全ワイヤレスイヤホン Bluetooth 5.3 最大60時間再生',itemPrice:7990},'完全ワイヤレスイヤホン',['Bluetooth 5.3','最大60時間再生'],/充電する回数|接続仕様/],
['humidifier',{itemName:'加湿器 3.2リットル大容量 フィルター交換不要',itemCaption:'加湿器 3.2リットル大容量 フィルター交換不要',itemPrice:55000},'加湿器',['3.2リットル大容量','フィルター交換不要'],/交換用フィルター/],
['kettle',{itemName:'電気ケトル 1.0L 7段階温度調節 4時間保温',itemCaption:'電気ケトル 1.0L 7段階温度調節 4時間保温',itemPrice:4980},'電気ケトル',['7段階温度調節','4時間保温'],/温度を選びたい|保温時間/],
['unknown',{itemName:'架空ツールX 重量 260g 幅 30cm',itemCaption:'架空ツールX 重量 260g 幅 30cm',itemPrice:1700},'架空ツールX',['重量 260g','幅 30cm'],/持ち運ぶときの重さ|置き場所/]
];
for(const [name,item,id,facts,want] of cases){const post=api.buildValidatedProductPost(item,id,facts);assert.ok(post,name+' blank');assert.match(post,want);assert.doesNotMatch(post,/商品説明では「|絶対|必ず|確実に|ランキング|受賞/);}
assert.equal(api.buildValidatedProductPost({itemName:'別の商品',itemCaption:'重量 100g'},'存在しない商品',['重量 100g']),'');
console.log('unknown universal finish: PASS');
