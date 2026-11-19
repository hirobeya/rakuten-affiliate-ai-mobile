'use strict';
const test=require('node:test');
const {localZeroCall}=require('../../api/room-ai-v3');
const {captionSentences,safeCaptionCandidates}=require('../../lib/local-generic-reasoner');
// Text excerpts copied directly from the customer's 2026-11-16 iPhone screenshots.
// These are not complete live Rakuten product records and must not be treated
// as proof that the full listing has been retrieved.
const screenshotSamples=[
 {label:'military leg pouch',itemCode:'screenshot:legpouch',itemName:'レッグポーチ レッグバッグ ポーチ ウエストポーチ バイク メンズ ウエストバッグ ポーチ 斜めがけ アウトドア 自転車 ミリタリーバッグ 斜め掛け おしゃれ ブランド',itemPrice:11260,
  itemCaption:'ツイルコーティング素材のボディと、ヴィンテージ本革型押しプレートが特徴的なミリタリー色の濃いレッグポーチ。カジュアルからシブめスタイルまで、いつものスタイルにMIXするだけでワンランク上のオシャレが楽しめること間違いなし。太ももに装着する手ぶらで便利なレッグポーチだから、タウンユースだけでなくツーリングやフィッシング、サバイバルゲームなどにも幅広く使えます！'},
 {label:'AVIREX 2WAY leg bag',itemCode:'screenshot:avirex',itemName:'アビレックス バッグ レッグバッグ ショルダーバッグ メンズ アヴィレックス AVIREX 斜めがけバッグ ウエストバッグ 2WAY ミリタリー EAGLE AVX348',itemPrice:6600,
  itemCaption:'■ POINT ● EAGLEシリーズの2WAYレッグバッグです。太股付近に装着できるほか、ショルダーやボディバッグとしても使用できます。●素材は帆布のような風合いの、軽くて丈夫なポリエステルキャンバスを使用。● AVIREX（アビレックス）もともとフライトジャケットをメインに歴史を重ねてきたエアロレザーカンパニーが前身。'}
];
test('inspect screenshot-backed missing-copy failure without external model calls',()=>{
 for(const item of screenshotSamples){
  const diag={};
  const baseline=localZeroCall(item);
  const editorial=localZeroCall(item,'',diag,{editorial:true,linkedReason:true,identityExpansion:true,verifiedIntent:true});
  console.log('SCREENSHOT_COPY_DIAG',JSON.stringify({item:item.label,baseline:baseline?.quality?.text||'',editorial:editorial?.quality?.text||'',diagnostic:diag,
    sentences:captionSentences(item.itemCaption,true),candidates:['レッグポーチ','レッグバッグ','ショルダーバッグ'].map(identity=>({identity,quotes:safeCaptionCandidates({itemName:item.itemName,itemCaption:item.itemCaption,identity,editorial:true,linkedReason:true}).map(x=>({quote:x.quote,axis:x.axis,kind:x.kind}))}))}));
 }
});
module.exports={screenshotSamples};
