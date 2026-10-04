'use strict';

const test=require('node:test');
const {localZeroCall}=require('../api/room-ai-v3');

const items=[
  {
    id:'fresh-umbrella-petina-bicolor',
    itemCode:'fresh:kizawa:petina-bicolor',
    itemName:'2026新作 日傘 折りたたみ 完全遮光 自動開閉 軽量 晴雨兼用 折りたたみ傘 レディース 折り畳み傘 コンパクト uvカット 紫外線対策 遮熱 超撥水 雨傘 プレゼント ギフト petina bicolor KIZAWA公式',
    itemCaption:'6本骨・直径88cm。自動開閉。軽量。晴雨兼用。',
    itemPrice:4180,
    imageUrl:''
  },
  {
    id:'fresh-humidifier-uhm-u01',
    itemCode:'fresh:iris:uhm-u01',
    itemName:'加湿器 超小型 アイリスオーヤマ 卓上 車内 デスク用 280ml 超音波式 連続7時間 タンブラー型 USB給電 エスプレッソ ミルク カフェオレ UHM-U01',
    itemCaption:'280ml。超音波式。連続7時間。タンブラー型。USB給電。',
    itemPrice:2180,
    imageUrl:''
  },
  {
    id:'fresh-laptop-stand-elecom',
    itemCode:'fresh:elecom:m2-elt-pca-ltsfsmbk',
    itemName:'エレコム パソコンスタンド ノートPC用 折りたたみ式 薄型 軽量 ブラック 11.6~13.3インチノートPC M2_ELT-PCA-LTSFSMBK',
    itemCaption:'ノートPCの底面に取り付けて使用する11.6～13.3インチノートPC対応の折りたたみ式スタンド。折りたたみ時は約幅200×奥行145×高さ4mm。質量約105g。',
    itemPrice:0,
    imageUrl:''
  }
];

test('blind fresh products - record current local route without modifying logic',()=>{
  const results=items.map(item=>({id:item.id,result:localZeroCall(item)}));
  console.log('FRESH_BLIND_LOCAL_20261004 '+JSON.stringify(results));
});
