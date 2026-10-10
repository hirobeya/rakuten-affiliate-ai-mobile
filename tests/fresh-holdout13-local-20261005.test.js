'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {localZeroCall}=require('../api/room-ai-v3');

// Frozen BEFORE first local evaluation on 2026-10-05.
// This is the final untouched generalization audit. Do NOT tune production logic
// against these products after observing the first run; any later architecture change
// requires a new holdout.
const items=[
  {id:'h13-01',category:'卓上製氷機',itemName:'卓上製氷機 家庭用 高速製氷 コンパクト 2サイズ 氷サイズ選択 1.3L アイスメーカー キッチン',itemCaption:'',itemPrice:0},
  {id:'h13-02',category:'ワイヤレスドアベル',itemName:'ワイヤレスドアベル 玄関チャイム 電池式 受信機 送信機 36曲 音量調節 防水 呼び鈴',itemCaption:'',itemPrice:0},
  {id:'h13-03',category:'電動ワインデキャンタ',itemName:'電動ワインデキャンタ ワインエアレーター 充電式 Type-C ワンタッチ 注ぎ口 ワイン用品',itemCaption:'',itemPrice:0},
  {id:'h13-04',category:'コードレスグルーガン',itemName:'コードレスグルーガン 充電式 USB-C DIY 接着工具 小型 スタンド付き グルースティック対応',itemCaption:'',itemPrice:0},
  {id:'h13-05',category:'スマートキーファインダー',itemName:'スマートキーファインダー Bluetooth 紛失防止タグ 電池式 キーホルダー スマホ連携 探し物タグ',itemCaption:'',itemPrice:0},
  {id:'h13-06',category:'キッチンコンポストボックス',itemName:'キッチンコンポストボックス 3L 生ごみ容器 ステンレス 蓋付き 活性炭フィルター 卓上',itemCaption:'',itemPrice:0},
  {id:'h13-07',category:'車載ハンディ掃除機',itemName:'車載ハンディ掃除機 コードレス 充電式 Type-C 120W 小型 カークリーナー ノズル付き',itemCaption:'',itemPrice:0},
  {id:'h13-08',category:'電気弁当箱',itemName:'電気弁当箱 40W 加熱式 ランチボックス 1.5L ステンレス容器 車載対応 保温弁当箱',itemCaption:'',itemPrice:0},
  {id:'h13-09',category:'モニターライト',itemName:'モニターライト USB給電 デスクライト 3段階調光 色温度調節 クリップ式 PCライト',itemCaption:'',itemPrice:0},
  {id:'h13-10',category:'自動泡ソープディスペンサー',itemName:'自動泡ソープディスペンサー センサー式 充電式 300ml 3段階調節 防水 ハンドソープディスペンサー',itemCaption:'',itemPrice:0}
];

test('holdout13 records untouched first local result with no tuning',()=>{
  const rows=items.map(item=>{
    const result=localZeroCall(item);
    if(result){
      assert.equal(result.groq.totalCalls,0);
      assert.equal(result.quality.status,'ready');
    }
    return {
      id:item.id,category:item.category,zeroCall:Boolean(result),
      productType:result?.productType?.specific||null,
      groqCalls:result?.groq?.totalCalls??null,
      decisionAxes:result?.decisionAxes||[],
      text:result?.quality?.text||null
    };
  });
  const zeroCallCount=rows.filter(x=>x.zeroCall).length;
  console.log('FRESH_HOLDOUT13_LOCAL_20261005 '+JSON.stringify({
    frozen:true,total:rows.length,zeroCallCount,
    groqNeededCount:rows.length-zeroCallCount,
    zeroCallRate:Number((zeroCallCount/rows.length).toFixed(4)),rows
  }));
});
