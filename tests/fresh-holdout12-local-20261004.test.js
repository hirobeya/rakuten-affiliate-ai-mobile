'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {localZeroCall}=require('../api/room-ai-v3');

// Frozen before first local evaluation on 2026-10-04.
// Final generalization set. Do not tune individual products after observing the first run.
const items=[
  {id:'h12-01',category:'USBカップウォーマー',itemName:'木目調 USB カップウォーマー 卓上 保温 コースター コーヒーウォーマー コップ 保温器 オフィス 5V 2A',itemCaption:'',itemPrice:0},
  {id:'h12-02',category:'ラベルプリンター',itemName:'スマホ連携 ラベルプリンター Bluetooth対応 感熱式 コンパクト ラベル シール印刷 家庭用 事務用',itemCaption:'',itemPrice:0},
  {id:'h12-03',category:'センサー式ゴミ箱',itemName:'センサー式ゴミ箱 自動開閉 充電式 15L ダストボックス ふた付き キッチン リビング',itemCaption:'',itemPrice:0},
  {id:'h12-04',category:'マグネットスパイスラック',itemName:'マグネットスパイスラック 冷蔵庫 横 収納ラック 調味料ラック スチール 壁面収納 キッチン',itemCaption:'',itemPrice:0},
  {id:'h12-05',category:'電動缶切り',itemName:'電動缶切り 自動 缶オープナー 電池式 ハンズフリー 缶切り機 キッチン用品',itemCaption:'',itemPrice:0},
  {id:'h12-06',category:'靴乾燥機',itemName:'靴乾燥機 くつ乾燥機 折りたたみ タイマー付き シューズドライヤー コンパクト',itemCaption:'',itemPrice:0},
  {id:'h12-07',category:'ペットグルーミング掃除機',itemName:'ペットグルーミング掃除機 犬 猫 抜け毛 ブラシ バリカン 5点セット 収納付き',itemCaption:'',itemPrice:0},
  {id:'h12-08',category:'自動給餌器',itemName:'自動給餌器 ペット 犬 猫 タイマー 定時給餌 4L フードディスペンサー 乾燥剤対応',itemCaption:'',itemPrice:0},
  {id:'h12-09',category:'折りたたみバケツ',itemName:'折りたたみバケツ シリコン 10L 収納 コンパクト 洗車 掃除 アウトドア',itemCaption:'',itemPrice:0},
  {id:'h12-10',category:'電動ミルクフォーマー',itemName:'電動ミルクフォーマー 泡立て器 充電式 USB Type-C 3段階調節 ハンドミキサー',itemCaption:'',itemPrice:0}
];

test('final holdout12 records first local result before any tuning',()=>{
  const rows=items.map(item=>{
    const result=localZeroCall(item);
    if(result){
      assert.equal(result.groq.totalCalls,0);
      assert.equal(result.quality.status,'ready');
    }
    return {id:item.id,category:item.category,zeroCall:Boolean(result),productType:result?.productType?.specific||null,groqCalls:result?.groq?.totalCalls??null,decisionAxes:result?.decisionAxes||[],text:result?.quality?.text||null};
  });
  const zeroCallCount=rows.filter(x=>x.zeroCall).length;
  console.log('FRESH_HOLDOUT12_LOCAL_20261004 '+JSON.stringify({frozen:true,total:rows.length,zeroCallCount,groqNeededCount:rows.length-zeroCallCount,zeroCallRate:Number((zeroCallCount/rows.length).toFixed(4)),rows}));
});
