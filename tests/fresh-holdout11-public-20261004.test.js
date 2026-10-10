'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {localZeroCall}=require('../api/room-ai-v3');

// Frozen before first local evaluation on 2026-10-04.
// Public Rakuten product titles collected after the holdout10 identity-centrality fix.
// Do not tune local reasoning against this set after observing first-run results.
const items=[
  {
    id:'h11-01',category:'折りたたみ水切りラック',itemCode:'holdout11:auc-risecreation:y0735',
    itemName:'水切りラック 折りたたみ スリム シンク上 くるくる巻ける 水切りかご 水切りマット コンパクト シリコン キッチン 水切 水きり 抗菌 錆びない 52×42cm 収納 洗い物 台所用品 滑り止め 伸縮',
    itemCaption:'',itemPrice:0,source:'https://item.rakuten.co.jp/auc-risecreation/y0735/'
  },
  {
    id:'h11-02',category:'卓上クリーナー',itemCode:'holdout11:sanwadirect:200-cd070',
    itemName:'卓上クリーナー 充電式 消しゴム USB デスク掃除機 ミニクリーナー ハンディクリーナー コンパクト 消しカス リビング学習 テレワーク 吸引 デスク キーボード 掃除',
    itemCaption:'',itemPrice:0,source:'https://item.rakuten.co.jp/sanwadirect/200-cd070/'
  },
  {
    id:'h11-03',category:'ペット用ドライブシート',itemCode:'holdout11:giipet:1250888',
    itemName:'ペット用ドライブシート 犬 車 ペットドライブシート 後部座席用 犬 車 シート 防水 耐摩耗 滑り止め 折り畳み式 大容量収納ポケット付き 汚れ防止 簡単取り付け',
    itemCaption:'',itemPrice:0,source:'https://item.rakuten.co.jp/giipet/1250888/'
  },
  {
    id:'h11-04',category:'LED懐中電灯',itemCode:'holdout11:patri:sl103',
    itemName:'LED懐中電灯 LEDライト COBライト フラッシュライト ランタン ズーム調節 生活防水 軽量 コンパクトボディ 吊り下げフック付き 90ルーメン 明るい 充電式 USB充電 緊急用 災害 停電 夜間 sl103',
    itemCaption:'',itemPrice:0,source:'https://item.rakuten.co.jp/patri/sl103/'
  },
  {
    id:'h11-05',category:'電動鉛筆削り',itemCode:'holdout11:tomicoco:c01-25a',
    itemName:'電動鉛筆削り えんぴつシャープナー 2削り穴 電池式 自動オフ 電動 小型 安全 小学生 色鉛筆 デッサン 美術 新学期 入学入園 入学祝い プレゼント おしゃれ 子供 学校 オフィス事務用',
    itemCaption:'',itemPrice:0,source:'https://item.rakuten.co.jp/tomicoco/c01-25a/'
  },
  {
    id:'h11-06',category:'毛玉取り器',itemCode:'holdout11:irisplaza:tkd-50a-w',
    itemName:'毛玉クリーナー TKD-50A-W 毛玉取り テスコム 電動 コンセント コード式 毛玉取り機 毛玉取り器 5段階調整 衣類 セーター ニット 靴下 ソファ カーペット 海外OK',
    itemCaption:'',itemPrice:0,source:'https://item.rakuten.co.jp/irisplaza-r/c/0000004944/'
  },
  {
    id:'h11-07',category:'ケーブルボックス',itemCode:'holdout11:e-kurashi:cablebox37',
    itemName:'ケーブルボックス ルーター 収納ボックス 幅40 奥行13.5 高さ37cm タップ コード 収納 配線カバー モデム ケーブル 隠す収納 整理整頓 整理収納 すっきり暮らす 山善 YAMAZEN',
    itemCaption:'',itemPrice:0,source:'https://item.rakuten.co.jp/e-kurashi/c/0000000490/'
  },
  {
    id:'h11-08',category:'オートソープディスペンサー',itemCode:'holdout11:hiroshop:g2',
    itemName:'ソープディスペンサー ハンドソープ オートディスペンサー自動 泡 吐出量3段階調節 充電式 防水 おしゃれ オートディスペンサー自動ディスペンサー詰め替え 300ml 壁掛け ハンドソープ 食器用洗剤キッチン洗面所などに適用',
    itemCaption:'',itemPrice:0,source:'https://item.rakuten.co.jp/hiroshop/g2/'
  },
  {
    id:'h11-09',category:'キッチンペーパーホルダー',itemCode:'holdout11:mamachi:074a-521',
    itemName:'キッチンペーパーホルダー 片手でカット おしゃれ 北欧 コストコ 大判対応 ペーパー立て キッチンタオルスタンド クッキングペーパー 台所 インテリア雑貨 シンプル ホワイト ブラック 白 黒 yamazaki 山崎実業 片手で切れるキッチンペーパーホルダー タワー tower',
    itemCaption:'',itemPrice:0,source:'https://item.rakuten.co.jp/mamachi/074a-521/'
  },
  {
    id:'h11-10',category:'電動ドライバー',itemCode:'holdout11:irisplaza:517095',
    itemName:'電動ドライバー アイリスオーヤマ コードレス 充電式 18v ドライバドリル18V JCD25 ドライバドリル 電動ドリル 電動ドリルドライバー ドライバー ドリル ドリルドライバー 工具 電動工具',
    itemCaption:'',itemPrice:0,source:'https://item.rakuten.co.jp/irisplaza-r/517095-cp/'
  }
];

test('eleventh untouched public holdout records first local result without tuning',()=>{
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
  console.log('FRESH_HOLDOUT11_LOCAL_20261004 '+JSON.stringify({
    frozen:true,total:rows.length,zeroCallCount,groqNeededCount:rows.length-zeroCallCount,
    zeroCallRate:Number((zeroCallCount/rows.length).toFixed(4)),rows
  }));
});
