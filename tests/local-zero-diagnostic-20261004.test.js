'use strict';

const test=require('node:test');
const {resolveLocalUnderstanding}=require('../lib/super-urenavi-router');
const structured=require('../public/structured-room-copy');

const items=[
  {id:'laptop',itemName:'エレコム パソコンスタンド ノートPC用 折りたたみ式 薄型 軽量 ブラック 11.6~13.3インチノートPC M2_ELT-PCA-LTSFSMBK',itemCaption:'ノートPCの底面に取り付けて使用する11.6～13.3インチノートPC対応の折りたたみ式スタンド。折りたたみ時は約幅200×奥行145×高さ4mm。質量約105g。'},
  {id:'neck',itemName:'ネックピロー 飛行機 車用 低反発 首枕 携帯枕 洗える u型 お昼寝枕 カバー付き クッション 軽量 トラベル 旅行',itemCaption:'28cm×25cm×13cm。ビロード生地。スマホポケット。重量 270g。カバーは取り外して洗濯できます。'},
  {id:'suitcase',itemName:'折畳みスーツケース 折りたたみ 40L キャリーケース キャリーバッグ 軽量 ダイヤル式ロック 2-3日用 360度回転 USBポート付き 旅行 出張 sh013',itemCaption:'展開サイズ 約W36cm×D27cm×H57cm。収納サイズ 約W36cm×D10cm×H57cm。重量 約2.7kg。容量 約40L。'}
];

test('diagnose local zero misses',()=>{
  for(const item of items){
    const local=resolveLocalUnderstanding(item);
    const identity=String(local?.raw?.productType?.value||'').trim();
    const copy=identity?structured.compose(item,{identity}):null;
    console.log('LOCAL_ZERO_DIAG '+JSON.stringify({id:item.id,local,identity,copy}));
  }
});
