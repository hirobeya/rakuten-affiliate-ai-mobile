'use strict';

const test=require('node:test');
const {localZeroCall}=require('../api/room-ai-v3');

// Fresh holdout fixed only after the generalized rule was implemented.
// Do not add product-specific rules for these products; the first result is recorded as-is.
const items=[
  {
    id:'holdout-ecoflow-river3plus',
    itemCode:'holdout:ecoflow:river-3-plus-c',
    itemName:'EcoFlow ポータブル電源 RIVER 3 Plus 286Wh 最大858Whまで拡張可能 UPS機能 長寿命 1hフル充電 5年保証 小型 静音 LEDライト付 蓄電池 発電機 ポータブル バッテリー アプリ対応 AC出力600W アウトドア エコフロー',
    itemCaption:'製品 RIVER 3 Plus 286Wh。容量 286Wh。本体重量 約4.7kg。寸法 234×232×146mm。定格出力 600W。',
    itemPrice:0,
    imageUrl:''
  },
  {
    id:'holdout-welllife-neckpillow',
    itemCode:'holdout:well-life:neckpillow',
    itemName:'ネックピロー 飛行機 車用 低反発 首枕 携帯枕 洗える u型 お昼寝枕 カバー付き クッション 軽量 トラベル 旅行',
    itemCaption:'28cm×25cm×13cm。ビロード生地。スマホポケット。重量 270g。カバーは取り外して洗濯できます。',
    itemPrice:0,
    imageUrl:''
  },
  {
    id:'holdout-ashop-sh013-suitcase',
    itemCode:'holdout:ashop:sh013',
    itemName:'折畳みスーツケース 折りたたみ 40L キャリーケース キャリーバッグ 軽量 ダイヤル式ロック 2-3日用 360度回転 USBポート付き 旅行 出張 sh013',
    itemCaption:'展開サイズ 約W36cm×D27cm×H57cm。収納サイズ 約W36cm×D10cm×H57cm。重量 約2.7kg。容量 約40L。',
    itemPrice:8180,
    imageUrl:''
  }
];

test('fresh untouched holdout - record generalized zero-call result as-is',()=>{
  const results=items.map(item=>({id:item.id,result:localZeroCall(item)}));
  console.log('FRESH_HOLDOUT_LOCAL_20261004 '+JSON.stringify(results));
});
