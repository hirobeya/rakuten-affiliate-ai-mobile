'use strict';

const assert=require('node:assert/strict');
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

test('first blind regressions remain safe after tighter zero-call fact boundary',()=>{
  const results=items.map(item=>({id:item.id,result:localZeroCall(item)}));
  console.log('FRESH_BLIND_LOCAL_20261004_REGRESSION '+JSON.stringify(results));

  // These two still contain independently bounded facts in the title.
  for(const row of results.slice(0,2)){
    assert.ok(row.result,row.id+' should keep the safe zero-call route');
    assert.equal(row.result.groq.totalCalls,0);
    assert.equal(row.result.quality.status,'ready');
    assert.ok(row.result.attributes.length>=1);
    assert.ok(row.result.quality.text.includes(row.result.productType.specific));
  }

  // "11.6~13.3インチノートPC" attaches the numeric unit directly to a noun.
  // The stricter generic boundary deliberately defers this semantic attachment to AI
  // rather than weakening the guard that blocks cases such as "5gプロペラ".
  const laptop=results[2];
  assert.equal(laptop.result,null,'noun-attached numeric specification should safely defer to AI');
});
