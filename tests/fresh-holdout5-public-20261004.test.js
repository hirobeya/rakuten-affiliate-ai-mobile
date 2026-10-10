'use strict';

const test=require('node:test');
const {localZeroCall}=require('../api/room-ai-v3');

// Fifth untouched public holdout.
// Frozen only after the zero-call implementation at f135267 and before reading
// any localZeroCall result for these products. Do not tune implementation before
// recording this first run.
const items=[
  {
    id:'holdout5-tanita-kd187wh',
    itemCode:'holdout5:tanita:KD187WH',
    itemName:'タニタ デジタルクッキングスケール KD187WH 1台 TANITA キッチンスケール',
    itemCaption:'',itemPrice:1580,imageUrl:''
  },
  {
    id:'holdout5-panasonic-ni-lc300',
    itemCode:'holdout5:panasonic:NI-LC300',
    itemName:'パナソニック 毛玉クリーナー NI-LC300 6枚刃 3段階モード切替 急速充電',
    itemCaption:'',itemPrice:3996,imageUrl:''
  },
  {
    id:'holdout5-makita-up181dz',
    itemCode:'holdout5:makita:UP181DZ',
    itemName:'マキタ makita UP181DZ 充電式せん定ハサミ 18V 本体のみ ホルスター付 バッテリー別売',
    itemCaption:'',itemPrice:43000,imageUrl:''
  },
  {
    id:'holdout5-ulanzi-mt44b',
    itemCode:'holdout5:ulanzi:MT-44B',
    itemName:'Ulanzi MT-44B 三脚 カメラ三脚 スマホ三脚 自撮り棒 2in1 スマホクリップデザイン',
    itemCaption:'',itemPrice:0,imageUrl:''
  },
  {
    id:'holdout5-shoe-laundry-net',
    itemCode:'holdout5:marys:shoe-net',
    itemName:'靴 洗濯ネット 靴用 靴用洗濯ネット 靴洗濯ネット スニーカー 靴洗いネット 家庭用 子供 上履き',
    itemCaption:'',itemPrice:780,imageUrl:''
  },
  {
    id:'holdout5-richell-water-dish',
    itemCode:'holdout5:richell:water-dish-s',
    itemName:'リッチェル ドッグウォーターディッシュ S 水飲み 給水 受け皿 サークル ケージ 犬',
    itemCaption:'',itemPrice:1640,imageUrl:''
  },
  {
    id:'holdout5-sakuraku-draining-rack',
    itemCode:'holdout5:sakuraku:draining-rack-2',
    itemName:'sakuraku 水切りラック 2段 シンク上 スリム 大容量 伸縮 キッチン サイド 20cm',
    itemCaption:'',itemPrice:12800,imageUrl:''
  },
  {
    id:'holdout5-yamazaki-ironing-board',
    itemCode:'holdout5:yamazaki:tower-ironing-board',
    itemName:'山崎実業 tower 平型アイロン台 タワー アイロン台 コンパクト 平型 60×36cm',
    itemCaption:'',itemPrice:2200,imageUrl:''
  },
  {
    id:'holdout5-eightex-chair-belt',
    itemCode:'holdout5:eightex:chairbelt',
    itemName:'EIGHTEX キャリフリー チェアベルト ショルダー＆メッシュ 日本製 ベビーチェア ベルト',
    itemCaption:'',itemPrice:3300,imageUrl:''
  },
  {
    id:'holdout5-nanolab-drying-plate',
    itemCode:'holdout5:nanolab:drying-plate-a4',
    itemName:'なのらぼ ドライングプレート A4サイズ 日本製 珪藻土 食器水切り 水切りトレー 水切りマット',
    itemCaption:'',itemPrice:3190,imageUrl:''
  }
];

test('fifth untouched public holdout - record first zero-call result as-is',()=>{
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
  console.log('FRESH_HOLDOUT5_PUBLIC_20261004 '+JSON.stringify({
    total:rows.length,
    zeroCallCount,
    groqNeededCount:rows.length-zeroCallCount,
    zeroCallRate:zeroCallCount/rows.length,
    rows
  }));
});
