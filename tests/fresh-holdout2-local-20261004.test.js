'use strict';

const test=require('node:test');
const {localZeroCall}=require('../api/room-ai-v3');

// Second untouched holdout selected only after the generic zero-call implementation
// and its regressions were green. These exact products/models were not present in the repo.
// Record the first result as-is; do not tune logic to these products before reading it.
const items=[
  {
    id:'holdout2-tiger-mcy-k060',
    itemCode:'holdout2:tiger:MCY-K060',
    itemName:'【タイガー魔法瓶 楽天市場店】 EC限定モデル 水筒 ステンレスボトル 真空断熱ボトル 600ml MCY-K060 スクリュー サハラ マグ SAHARA 軽量 清潔 保温 保冷 直飲み 抗菌 おしゃれ 丸洗い タイガー',
    itemCaption:'本体サイズ 約6.9×6.9×24.2cm。本体質量 約0.23kg。容量 0.6L。口径 約4.0cm。',
    itemPrice:0,
    imageUrl:''
  },
  {
    id:'holdout2-nova-wxejxxx87',
    itemCode:'holdout2:nova:wxejxxx87',
    itemName:'ワイヤレスイヤホン Bluetooth5.3 完全ワイヤレスイヤホン インナーイヤー 高音質 低遅延 LED残量表示 自動ペアリング タッチ操作 軽量 通話 ゲーム iPhone Android対応 技適認証済み 充電ケース 6色',
    itemCaption:'Bluetooth 5.3。8mmドライバー。軽量3.6g。完全ワイヤレスイヤホン。',
    itemPrice:0,
    imageUrl:''
  },
  {
    id:'holdout2-iris-slr-ex895',
    itemCode:'holdout2:iris:SLR-EX895',
    itemName:'【公式】ランドリーラック 伸縮 おしゃれ 縦型 スリム アイリスオーヤマ 伸縮 可動棚 洗濯機ラック 送料無料 SLR-EX895 一人暮らし ランドリー収納 洗面所 洗濯機 収納 省スペース 北欧 シンプル ホワイト ブラック',
    itemCaption:'ランドリーラック。洗濯機上に設置する伸縮タイプ。ハンガーバーとバスケット付き。',
    itemPrice:0,
    imageUrl:''
  }
];

test('second untouched fresh holdout - record first generalized zero-call result as-is',()=>{
  const results=items.map(item=>({id:item.id,result:localZeroCall(item)}));
  console.log('FRESH_HOLDOUT2_LOCAL_20261004 '+JSON.stringify(results));
});
