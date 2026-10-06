'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {validateUnderstanding}=require('../lib/super-urenavi-v3-understanding');
const {applyVerification}=require('../lib/super-urenavi-v3-verifier');
const {composePurchaseCopy}=require('../lib/grounded-purchase-copy');
// Synthetic source contracts: these do not measure live model extraction or verification.
const rows=[
 ['バイクグローブ','バイクグローブ','スマホ対応','停車中にスマホを操作するとき','停車中のスマホ操作にも対応しています'],
 ['収納ベンチ','収納ベンチ','座面下に収納スペース','腰掛ける場所に収納もまとめたいとき','座面下のスペースに物を収納できます'],
 ['モップハンガー','モップハンガー','モップの柄を挟んで壁に掛ける','モップを壁に掛けて収納するとき','柄を挟んでモップを壁に収納できます'],
 ['空調服バッテリー','空調服用バッテリー','対応ファン専用の電源','対応する空調服のファンに電源をつなぐとき','対応ファンの電源として使うバッテリーです'],
 ['ペット毛取りグローブ','ペット毛取りグローブ','手にはめてペットの抜け毛を取る','ペットの抜け毛を取るとき','手にはめてペットの毛を取れます'],
 ['BOS袋','BOS袋','使用済みおむつを入れる袋','使用済みおむつを袋に入れるとき','おむつの処理用に使う袋です'],
 ['美顔ローラー','美顔ローラー','顔の上を転がして使用','顔の上でローラーを転がすとき','顔に当てて転がすタイプのローラーです'],
 ['モバイルバッテリー','モバイルバッテリー','USB-C接続でスマホを充電','スマホをUSB-Cで充電するとき','USB-Cで接続してスマホを充電できます'],
 ['キッチン用品','計量スプーン','大さじと小さじを計量','調味料を大さじや小さじで量るとき','大さじと小さじの分量を量れます'],
 ['収納用品','収納ボックス','折りたたみ式','収納ボックスを使わず片付けるとき','使わないときは折りたたんで収納できます'],
 ['美容雑貨','化粧ポーチ','ブラシを分けて収納する仕切り','メイクブラシを分けて持ち歩くとき','仕切りでブラシを分けて収納できます'],
 ['ペット用品','ペット用給水器','水を入れるボトルと飲み口が一体','ペットにボトルから水を飲ませるとき','ボトルと飲み口が一体になっています'],
 ['衣類','レインコート','フード付き','フードのあるレインコートを着るとき','頭にもかぶれるフードが付いています'],
 ['家電','コードレス掃除機','充電式でコンセントにつながず掃除','コンセントにつながず床を掃除するとき','充電してコードをつながず掃除できます'],
 ['食品','冷凍おにぎり','電子レンジで温めて食べる','電子レンジでおにぎりを温めるとき','冷凍のまま電子レンジで温めて食べられます'],
 ['掃除グローブ','掃除用グローブ','手にはめて窓を拭く','窓を手にはめたグローブで拭くとき','手にはめて窓を拭ける掃除用グローブです'],
 ['野球グローブ','野球グローブ','右投げ用','右投げ用の野球グローブを選ぶとき','右投げ用として使う野球グローブです'],
 ['作業グローブ','作業用グローブ','園芸作業用','園芸で手袋を着けて作業するとき','園芸作業に使うグローブです']
];
const details=['山羊革 防風 オールシーズン','幅80cm 木製','粘着式 壁面取り付け','対応型番AB専用 充電器付属','シリコン製 左右セット','袋100枚入り Sサイズ','持ち手付き ステンレス製','容量10000mAh USB-C','ステンレス製 食洗機対応','幅30cm フタ付き','ファスナー付き 横幅20cm','容量300ml 飲み口付き','ポリエステル製 サイズMとL','充電器付属 重量1.5kg','冷凍保存 6個入り','左右セット マイクロファイバー','合成皮革 サイズM','綿製 サイズM'];
const report=[];
for(const [category,type,quote,scene,text] of rows){
 const item={itemName:type,itemCaption:quote+'。'+details[report.length],itemPrice:3280};
 const raw={productType:{specific:type,general:type,quote:type},attributes:[{name:'用途・仕様',value:quote,quote},{name:'追加仕様',value:details[report.length],quote:details[report.length]}],appeals:[{text,scene,noHassle:'',attributeRefs:[0],strength:3}]};
 const validation=validateUnderstanding(raw,item);
 const verifiedAppeals=applyVerification(validation,{results:[{verificationIndex:0,supported:true,keepDirectFact:true,reason:'synthetic contract'}]});
 const result=composePurchaseCopy({item,analysis:{validation,verifiedAppeals}});
 assert.equal(result.status,'ready',category+' '+JSON.stringify(result));
 assert.ok(result.text.length>=80&&result.text.length<=500,category);
 assert.doesNotMatch(result.text,/商品名には|明記されています|比較しやすい|素材を見て選びたい|便利|快適|時短/);
 assert.equal(result.ledger[0].facts[0].quote,quote);
 if(category!=='バイクグローブ') assert.doesNotMatch(result.text,/停車中|スマホ対応/);
 assert.equal(composePurchaseCopy({item,analysis:{validation,verifiedAppeals:applyVerification(validation,{results:[]})}}).status,'blocked');
 report.push({category,item,verification:'mocked, not live',text:result.text,ledger:result.ledger});
}
const item={itemName:'バイクグローブ',itemCaption:'スマホ対応 10サイズ'};
const validation={valid:true,productType:{specific:'バイクグローブ'},attributes:[{value:'スマホ対応',quote:'スマホ対応'},{value:'10サイズ',quote:'10サイズ'}]};
const base={text:'停車中のスマホ操作に対応',scene:'停車中にスマホを操作するとき',attributeRefs:[0],verification:{supported:true}};
for(const change of [
 {text:'走行中にスマホ操作ができます',scene:'走行中'},
 {text:'停車中でも快適にスマホ操作'},
 {text:'スマホ対応',scene:'停車中の快適なスマホ操作に'},
 {text:'停車中に1サイズを選べる',attributeRefs:[1]},
 {text:'商品名にはスマホ対応と明記されています'},
 {text:'停車中にスマホ操作',attributeRefs:[5]},
 {verification:{supported:false}}
]) assert.equal(composePurchaseCopy({item,analysis:{validation,verifiedAppeals:[{...base,...change}]}}).status,'blocked',JSON.stringify(change));
const negative={itemName:'バイクグローブ 非防水',itemCaption:''};
assert.equal(composePurchaseCopy({item:negative,analysis:{validation:{...validation,attributes:[{value:'防水',quote:'防水'}]},verifiedAppeals:[{...base,text:'停車中の雨対策になる',attributeRefs:[0]}]}}).status,'blocked');
assert.equal(new Set(report.map(x=>x.text)).size,rows.length);
if(process.argv.includes('--report')) fs.writeFileSync('docs/grounded-purchase-contracts-20261002.json',JSON.stringify({scope:'Renderer contracts only, not editorial quality approval. 18 synthetic contract cases; 15 requested categories + 3 glove types; model results mocked, no live coverage claim',cases:report},null,2)+'\n');
console.log('grounded-purchase-copy.test.js: PASS (18 synthetic contracts + adverse cases; not live model evaluation)');


{
  const item={itemName:'ブラジャー用洗濯ネット',itemCaption:'型崩れを防ぐ。ドラム式対応。'};
  const validation={
    valid:true,
    semanticDraft:true,
    productType:{specific:'ブラジャー用洗濯ネット',quote:'ブラジャー用洗濯ネット'},
    attributes:[
      {quote:'型崩れを防ぐ',value:'型崩れを防ぐ'},
      {quote:'ドラム式対応',value:'ドラム式対応'}
    ],
    appeals:[{
      index:0,
      text:'ブラジャー用洗濯ネットは型崩れを防ぎ、ドラム式でも使えます。',
      noHassle:'',
      scene:'',
      attributeRefs:[0,1],
      strength:3
    }]
  };
  const verifiedAppeals=[{
    ...validation.appeals[0],
    verification:{required:true,supported:true,keepDirectFact:true,reason:'verified_text_scene_dropped'}
  }];
  const result=composePurchaseCopy({item,analysis:{validation,verifiedAppeals}});
  assert.equal(result.status,'ready','verified semantic body remains publishable when unsafe scene is dropped');
  assert.match(result.text,/ブラジャー用洗濯ネットを選ぶなら。/);
  assert.match(result.text,/型崩れを防ぎ、ドラム式でも使えます。/);
}
