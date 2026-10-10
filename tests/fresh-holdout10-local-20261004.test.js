'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {localZeroCall}=require('../api/room-ai-v3');

// Frozen before first local evaluation on 2026-10-04.
// Public Rakuten product titles across unrelated categories.
// Do not tune local reasoning against this set after observing first-run results.
const items=[
  {
    id:'h10-01',category:'自転車スマホホルダー',itemCode:'holdout10:centrality:0981-000774',
    itemName:'自転車 スマホホルダー バイク ワンタッチ 簡単 自動ロック 脱落防止 振動吸収 スマホスタンド iPhone android 360度 オートバイ ベビーカー 自動開閉式 防水 ママチャリ',
    itemCaption:'',itemPrice:0,
    source:'https://item.rakuten.co.jp/nagomi-japan/0981-000774/'
  },
  {
    id:'h10-02',category:'マグネットティッシュケース',itemCode:'holdout10:iseto:56810',
    itemName:'伊勢藤 ISETO ティッシュケース マグネット付き 箱ティッシュ用 自由設置 横置きOK 日本製 磁石 ホワイト 冷蔵庫 限定色 黒 Black',
    itemCaption:'',itemPrice:0,
    source:'https://item.rakuten.co.jp/iseto-store/4966149568107/'
  },
  {
    id:'h10-03',category:'コードレス衣類スチーマー',itemCode:'holdout10:toshiba:tasmx8',
    itemName:'東芝 衣類スチーマー TASMX8 TOSHIBA TAS-MX8H コードレス衣類スチーマー La・Coo-S モーブグレージュ',
    itemCaption:'',itemPrice:0,
    source:'https://item.rakuten.co.jp/koreda/tasmx8/'
  },
  {
    id:'h10-04',category:'折りたたみ踏み台',itemCode:'holdout10:sunday:4580631465691',
    itemName:'折りたたみ踏み台 高さ 22cm 39cm ライトピンク ライトブルー ライトベージュ 折りたたみ式 すべり止め付 コンパクト収納 軽作業 アウトドア ガーデニング ステップ台',
    itemCaption:'',itemPrice:0,
    source:'https://item.rakuten.co.jp/sunday-netshop/s4580631465691/'
  },
  {
    id:'h10-05',category:'電動コーヒーミル',itemCode:'holdout10:bellelife:1000000502',
    itemName:'2026年最新型 電動コーヒーミル コードレス 電動 コーヒーグラインダー コーヒーメーカー ポータブル コーヒーメーカー ミル付 持ち運び コーヒーミル タンブラー ドリッパー付 挽き立て USB充電 Type-C 粒度調節',
    itemCaption:'',itemPrice:0,
    source:'https://item.rakuten.co.jp/bellelife2016/1000000502/'
  },
  {
    id:'h10-06',category:'卓上加湿器',itemCode:'holdout10:sanwa:400-toy047w',
    itemName:'加湿器 小型 卓上加湿器 超音波式 usb 大容量 オフィス 500ml 10時間連続運転 USB給電 Type-C 静音 小型 小型加湿器 加湿量30ml～70ml/h LEDライト デスク 車 車載 寝室 ホワイト おしゃれ',
    itemCaption:'',itemPrice:0,
    source:'https://item.rakuten.co.jp/sanwadirect/400-toy047w/'
  },
  {
    id:'h10-07',category:'ペット給水器フィルター',itemCode:'holdout10:lifeideas:filter001',
    itemName:'ペット給水器フィルター 活性炭フィルター 4枚セット 自動循環式 給水器用 猫 犬 水飲み器 ペット 自動水やり器 ペット給水器 2.6L',
    itemCaption:'',itemPrice:0,
    source:'https://item.rakuten.co.jp/lifeideas/filter001/'
  },
  {
    id:'h10-08',category:'ブックスタンド',itemCode:'holdout10:anomaly:chi1832',
    itemName:'ブックスタンド 角度調整 可変式 折り畳み ブックスタンド 本立て 書見台 卓上 折り畳み 伸縮 レシピスタンド 軽量 おしゃれ パソコン ページホルダー ブックスタンダー スタンドタイプ PC ノート PC作業 効率アップ',
    itemCaption:'',itemPrice:0,
    source:'https://item.rakuten.co.jp/anomaly/chi1832/'
  },
  {
    id:'h10-09',category:'ハンディファン',itemCode:'holdout10:toffy:hfn6',
    itemName:'Toffy 冷却プレート ハンディファン 折りたためる 冷たい プレート 手持ち 扇風機 ハンディ コンパクト ネックスファン 卓上 角度調整 持ち運び 簡単 小型 ファン USB充電 Type-C 風量調節 熱中症 暑さ 対策 かわいい カラフル プレゼント トフィー 父の日',
    itemCaption:'',itemPrice:0,
    source:'https://item.rakuten.co.jp/toffy/hfn6/'
  },
  {
    id:'h10-10',category:'真空パック機',itemCode:'holdout10:gigawave:fzfz1821385',
    itemName:'コードレス マグネット付き USB充電式 鮮度保持 真空パック器 真空保存 真空パック機 専用袋不要 フードシーラー 密封保存 フードシーラー 食品保存 コンパクト 真空シーラー 真空パック機 乾湿両用 強力脱気 家庭用',
    itemCaption:'',itemPrice:0,
    source:'https://item.rakuten.co.jp/gigawave/fzfz1821385/'
  }
];

test('tenth untouched public holdout records first local result without tuning',()=>{
  const rows=items.map(item=>{
    const result=localZeroCall(item);
    if(result){
      assert.equal(result.groq.totalCalls,0);
      assert.equal(result.quality.status,'ready');
    }
    return {
      id:item.id,
      category:item.category,
      zeroCall:Boolean(result),
      productType:result?.productType?.specific||null,
      groqCalls:result?.groq?.totalCalls??null,
      decisionAxes:result?.decisionAxes||[],
      text:result?.quality?.text||null
    };
  });
  const zeroCallCount=rows.filter(x=>x.zeroCall).length;
  console.log('FRESH_HOLDOUT10_LOCAL_20261004 '+JSON.stringify({
    frozen:true,total:rows.length,zeroCallCount,groqNeededCount:rows.length-zeroCallCount,
    zeroCallRate:Number((zeroCallCount/rows.length).toFixed(4)),rows
  }));
});
