'use strict';

const test=require('node:test');
const {localZeroCall}=require('../api/room-ai-v3');

// Sixth untouched public holdout. Selected from current Rakuten ranking pages
// after HEAD 4e691245 and frozen before reading any localZeroCall result.
// Do not tune implementation to these products before recording this first run.
const items=[
  {
    id:'holdout6-tanita-bc768',
    itemCode:'holdout6:tanita:BC-768',
    itemName:'タニタ 体組成計 体重計 スマホ連動 BC-768 パールホワイト メタリックブラック 体脂肪率 内臓脂肪レベル',
    itemCaption:'',itemPrice:7980,imageUrl:''
  },
  {
    id:'holdout6-timemore-s5',
    itemCode:'holdout6:timemore:CHESTNUT-S5',
    itemName:'TIMEMORE公式 CHESTNUT S5 手挽きコーヒーミル 手動 コーヒーグラインダー 高精度48mm12星刃',
    itemCaption:'',itemPrice:25800,imageUrl:''
  },
  {
    id:'holdout6-marna-doorstopper',
    itemCode:'holdout6:marna:door-stopper',
    itemName:'マーナ公式 踏むだけで固定 立ったまま解除できる ドアストッパー 玄関 強力 マグネット ゴム 足 扉 止め ドア止め',
    itemCaption:'',itemPrice:5500,imageUrl:''
  },
  {
    id:'holdout6-iris-shoe-dryer',
    itemCode:'holdout6:iris:shoe-dryer',
    itemName:'靴乾燥機 アイリスオーヤマ シューズドライヤー 小型 オゾン脱臭 除菌 靴 乾燥機 シューズ乾燥機 2足同時乾燥',
    itemCaption:'',itemPrice:4780,imageUrl:''
  },
  {
    id:'holdout6-sakuraku-compression-box',
    itemCode:'holdout6:sakuraku:pshhto-box-clothes',
    itemName:'sakuraku pshhto BOX 衣類用 衣類圧縮袋 スティック型対応 圧縮袋一体型BOX',
    itemCaption:'',itemPrice:5800,imageUrl:''
  },
  {
    id:'holdout6-yamazaki-bath-chair-sh25',
    itemCode:'holdout6:yamazaki:tower-SH25',
    itemName:'山崎実業 マグネット風呂イス タワー SH25 座面高さ25cm tower 風呂椅子 マグネット',
    itemCaption:'',itemPrice:4620,imageUrl:''
  },
  {
    id:'holdout6-soomloom-lumina5000',
    itemCode:'holdout6:soomloom:Lumina5000',
    itemName:'Soomloom キャンプランタン Lumina5000 充電式 LEDランタン 調光機能 ライト 照明 キャンプ ランプ 磁石付き 5000mAh',
    itemCaption:'',itemPrice:2450,imageUrl:''
  },
  {
    id:'holdout6-braun-oralb-io2',
    itemCode:'holdout6:braun:OralB-iO2',
    itemName:'ブラウン オーラルB iO2 電動歯ブラシ コスパモデル ホワイト 電動歯みがき',
    itemCaption:'',itemPrice:10978,imageUrl:''
  },
  {
    id:'holdout6-delonghi-ecam22020b',
    itemCode:'holdout6:delonghi:ECAM22020B',
    itemName:'デロンギ マグニフィカ スタート 全自動コーヒーマシン ECAM22020B コーヒーメーカー ミル付き',
    itemCaption:'',itemPrice:97800,imageUrl:''
  },
  {
    id:'holdout6-omron-krd203',
    itemCode:'holdout6:omron:KRD-203',
    itemName:'オムロン 公式 体重計 体組成計 KRD-203 カラダスキャン ホワイト ダークブルー',
    itemCaption:'',itemPrice:3680,imageUrl:''
  }
];

test('sixth untouched public holdout - record first zero-call result as-is',()=>{
  const rows=items.map(item=>{
    const result=localZeroCall(item);
    return {
      id:item.id,
      zeroCall:Boolean(result),
      productType:result?.productType?.specific||null,
      groqCalls:result?.groq?.totalCalls??null,
      text:result?.quality?.text||null
    };
  });
  const zeroCallCount=rows.filter(x=>x.zeroCall).length;
  console.log('FRESH_HOLDOUT6_PUBLIC_20261004 '+JSON.stringify({
    total:rows.length,
    zeroCallCount,
    groqNeededCount:rows.length-zeroCallCount,
    zeroCallRate:zeroCallCount/rows.length,
    rows
  }));
});
