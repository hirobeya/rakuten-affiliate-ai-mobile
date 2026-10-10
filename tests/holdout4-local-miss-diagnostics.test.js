'use strict';

const test=require('node:test');
const {localZeroCall}=require('../api/room-ai-v3');
const {resolveLocalUnderstanding}=require('../lib/super-urenavi-router');
const structured=require('../public/structured-room-copy');

const items=[
  ['airpods-case','ESR AirPods Pro3 ケース ESR AirPods Pro 3 Cyber MagSafe対応 フリックロックケース',2890],
  ['pencilcase','筆箱 ソニック うかサポ Wシート補強 小学生 ペンケース',1980],
  ['suitcase','日本ブランド スーツケース キャリーケース ファスナータイプ 軽量 大容量 容量拡張 ストッパー付 キャスター TSロック 4〜6泊 Mサイズ LW LUCE ルーチェ 5222-58',12280],
  ['hose-reel','タカギ ホースリール コンパクトリール 10m 15m 選べるニップルセット 散水 ホース ハンガータイプ 壁掛け ベランダ 園芸 洗車 掃除',2780],
  ['yoga-towel','Manduka ヨガラグ ヨガタオル クリスタルクォーツ',13200],
  ['desk-light','デスクライト 学習スタンド LED USB充電 タッチセンサースイッチ 充電式 調光 調色 折り畳み オーム電機 DS-LD24AG-W',2728],
  ['dog-harness','Truelove公式 犬 ハーネス 軽い 小型犬 中型犬 メッシュ クッション 立体構造 ライト＆ソフトハーネス ハッピーパターン TLH30131',0],
  ['knife-sharpener','逸品物創 たためるダイヤモンドシャープナー 包丁研ぎ器 コンパクト収納 折りたたみ式 77908',0],
  ['watch','カシオ ウェーブセプター WVA-M630L ソーラー腕時計 メンズ 電波ソーラー腕時計 レザーバンド CASIO 太陽光充電',0],
  ['taiwan-esim','台湾 eSIM 20GB 7日間 プリペイドeSIM 旅行 即時利用 QRコード データ専用',2350]
].map(([id,itemName,itemPrice])=>({id,itemCode:'diag:'+id,itemName,itemCaption:'',itemPrice,imageUrl:''}));

test('classify untouched holdout4 local misses without tuning',()=>{
  const rows=items.map(item=>{
    const rule=resolveLocalUnderstanding({itemName:item.itemName,itemCaption:''});
    const ruleIdentity=rule?.raw?.productType?.value||null;
    const composed=structured.compose(item,ruleIdentity?{identity:ruleIdentity}:{});
    const zero=localZeroCall(item);
    return {
      id:item.id,
      zeroCall:Boolean(zero),
      ruleIdentity,
      structuredStatus:composed?.status||null,
      structuredMethod:composed?.understanding?.method||null,
      structuredIdentity:composed?.understanding?.identity||null,
      structuredFacts:Array.isArray(composed?.facts)?composed.facts.map(x=>x.quote||x.text||String(x)):[],
      structuredValues:Array.isArray(composed?.values)?composed.values.map(x=>x.text||String(x)):[]
    };
  });
  console.log('HOLDOUT4_LOCAL_MISS_DIAGNOSTICS '+JSON.stringify(rows));
});
