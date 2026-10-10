'use strict';

const test=require('node:test');
const {localZeroCall}=require('../api/room-ai-v3');

// Fourth untouched holdout. Product titles were collected from current public Rakuten
// pages on 2026-10-04, after the previous fixes were committed. The implementation
// must not be tuned to these products before this first run is recorded.
const items=[
  {
    id:'holdout4-esr-airpods-pro3-case',
    itemCode:'holdout4:esr:airpods-pro3-case',
    itemName:'ESR AirPods Pro3 ケース ESR AirPods Pro 3 Cyber MagSafe対応 フリックロックケース',
    itemCaption:'',itemPrice:2890,imageUrl:''
  },
  {
    id:'holdout4-sonic-ukasapo-pencilcase',
    itemCode:'holdout4:sonic:ukasapo-pencilcase',
    itemName:'筆箱 ソニック うかサポ Wシート補強 小学生 ペンケース',
    itemCaption:'',itemPrice:1980,imageUrl:''
  },
  {
    id:'holdout4-luce-suitcase',
    itemCode:'holdout4:luce:5222-58',
    itemName:'日本ブランド スーツケース キャリーケース ファスナータイプ 軽量 大容量 容量拡張 ストッパー付 キャスター TSロック 4〜6泊 Mサイズ LW LUCE ルーチェ 5222-58',
    itemCaption:'',itemPrice:12280,imageUrl:''
  },
  {
    id:'holdout4-takagi-hose-reel',
    itemCode:'holdout4:takagi:hose-reel',
    itemName:'タカギ ホースリール コンパクトリール 10m 15m 選べるニップルセット 散水 ホース ハンガータイプ 壁掛け ベランダ 園芸 洗車 掃除',
    itemCaption:'',itemPrice:2780,imageUrl:''
  },
  {
    id:'holdout4-manduka-yoga-towel',
    itemCode:'holdout4:manduka:yoga-towel',
    itemName:'Manduka ヨガラグ ヨガタオル クリスタルクォーツ',
    itemCaption:'',itemPrice:13200,imageUrl:''
  },
  {
    id:'holdout4-ohm-desk-light',
    itemCode:'holdout4:ohm:DS-LD24AG-W',
    itemName:'デスクライト 学習スタンド LED USB充電 タッチセンサースイッチ 充電式 調光 調色 折り畳み オーム電機 DS-LD24AG-W',
    itemCaption:'',itemPrice:2728,imageUrl:''
  },
  {
    id:'holdout4-truelove-dog-harness',
    itemCode:'holdout4:truelove:TLH30131',
    itemName:'Truelove公式 犬 ハーネス 軽い 小型犬 中型犬 メッシュ クッション 立体構造 ライト＆ソフトハーネス ハッピーパターン TLH30131',
    itemCaption:'',itemPrice:0,imageUrl:''
  },
  {
    id:'holdout4-arnest-knife-sharpener',
    itemCode:'holdout4:arnest:77908',
    itemName:'逸品物創 たためるダイヤモンドシャープナー 包丁研ぎ器 コンパクト収納 折りたたみ式 77908',
    itemCaption:'',itemPrice:0,imageUrl:''
  },
  {
    id:'holdout4-casio-waveceptor-watch',
    itemCode:'holdout4:casio:WVA-M630L',
    itemName:'カシオ ウェーブセプター WVA-M630L ソーラー腕時計 メンズ 電波ソーラー腕時計 レザーバンド CASIO 太陽光充電',
    itemCaption:'',itemPrice:0,imageUrl:''
  },
  {
    id:'holdout4-taiwan-esim',
    itemCode:'holdout4:esim:taiwan20gb7d',
    itemName:'台湾 eSIM 20GB 7日間 プリペイドeSIM 旅行 即時利用 QRコード データ専用',
    itemCaption:'',itemPrice:2350,imageUrl:''
  }
];

test('fourth untouched public holdout - record first generalized zero-call result as-is',()=>{
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
  const report={
    total:rows.length,
    zeroCallCount:rows.filter(x=>x.zeroCall).length,
    groqNeededCount:rows.filter(x=>!x.zeroCall).length,
    zeroCallRate:Number((rows.filter(x=>x.zeroCall).length/rows.length).toFixed(4)),
    rows
  };
  console.log('FRESH_HOLDOUT4_PUBLIC_20261004 '+JSON.stringify(report));
});
