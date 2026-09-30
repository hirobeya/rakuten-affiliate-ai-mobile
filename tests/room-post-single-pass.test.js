'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const gen=require('../lib/room-post-generator-v1');

test('input cleanup strips html and shop boilerplate without inventing content',()=>{
  const x=gen.prepareInput({itemName:'収納ボックス',itemCaption:'<b>50L</b>\n送料無料\n使わない時は折りたたみ可能'});
  assert.equal(x.itemName,'収納ボックス');
  assert.match(x.description,/50L/);
  assert.match(x.description,/折りたたみ可能/);
  assert.doesNotMatch(x.description,/送料無料/);
  assert.doesNotMatch(x.description,/<b>/);
});

test('description threshold is a single exported constant',()=>{
  assert.equal(typeof gen.MIN_DESCRIPTION_CHARS,'number');
  assert.ok(gen.MIN_DESCRIPTION_CHARS>0);
  const short=gen.prepareInput({itemName:'商品',itemCaption:'短い説明'});
  assert.ok(gen.effectiveTextLength(short)<gen.MIN_DESCRIPTION_CHARS);
});

test('final inspection deletes only offending sentences',()=>{
  const input=gen.prepareInput({itemName:'電気ケトル 0.8L',itemCaption:'1℃単位で温度設定できます'});
  const raw={understood:true,product_summary:'電気ケトル',facts_used:['0.8L'],post_text:'0.8Lの電気ケトルです。絶対に安全です。容量2Lで家族分にも便利です。1℃単位で温度を選べます。',hashtags:['#電気ケトル']};
  const out=gen.inspectOutput(raw,input);
  assert.match(out.final.post_text,/0.8L/);
  assert.match(out.final.post_text,/1℃/);
  assert.doesNotMatch(out.final.post_text,/絶対/);
  assert.doesNotMatch(out.final.post_text,/2L/);
  assert.equal(out.removedSentenceCount,2);
});

test('abstract interchangeable copy is removed',()=>{
  const input=gen.prepareInput({itemName:'バイクグローブ',itemCaption:'スマホ対応'});
  const raw={understood:true,product_summary:'バイクグローブ',facts_used:['スマホ対応'],post_text:'機能が魅力です。停車中にスマホを確認したい時に、スマホ対応なのが便利。',hashtags:[]};
  const out=gen.inspectOutput(raw,input);
  assert.doesNotMatch(out.final.post_text,/機能が魅力/);
  assert.match(out.final.post_text,/スマホ対応/);
});

test('foreign-script contamination is removed sentence by sentence',()=>{
  const input=gen.prepareInput({itemName:'収納ベンチ 折りたたみ',itemCaption:'折りたたみ式収納ベンチ。'});
  const raw={understood:true,product_summary:'収納ベンチ',facts_used:['折りたたみ'],post_text:'折りたたみ式収納ベンチです。コンパクトに хранえる設計です。使わない時はたたんでおけます。',hashtags:['#収納ベンチ']};
  const out=gen.inspectOutput(raw,input);
  assert.match(out.final.post_text,/収納ベンチです/);
  assert.match(out.final.post_text,/たたんでおけます/);
  assert.doesNotMatch(out.final.post_text,/хран/);
  assert.equal(out.removedSentenceCount,1);
});

test('numeric-unit meaning swaps are rejected and Japanese spacing artifacts are normalized',()=>{
  const input=gen.prepareInput({itemName:'クッキー抜き型 動物 6個セット',itemCaption:'動物型のクッキー抜き型6個セット。'});
  const raw={understood:true,product_summary:'クッキー抜き型',facts_used:['6個セット'],post_text:'動物型のクッキー抜き型6個セットで す。6種類そろっています。',hashtags:['#クッキー抜き型']};
  const out=gen.inspectOutput(raw,input);
  assert.match(out.final.post_text,/です/);
  assert.doesNotMatch(out.final.post_text,/6種類/);
  assert.equal(out.removedSentenceCount,1);
});

test('unsupported factual adjectives are removed when absent from source',()=>{
  const input=gen.prepareInput({itemName:'ポータブル電源 768Wh 定格出力800W USB-C',itemCaption:'容量768Wh、定格出力800W。USB-Cポート搭載。'});
  const out=gen.inspectOutput({understood:true,product_summary:'ポータブル電源',facts_used:['768Wh'],post_text:'小型のポータブル電源です。容量768Whです。',hashtags:[]},input);
  assert.doesNotMatch(out.final.post_text,/小型/);
  assert.match(out.final.post_text,/768Wh/);
});

test('unsafe riding-phone scene is removed while stopped phone use is allowed',()=>{
  const input=gen.prepareInput({itemName:'バイク グローブ スマホ対応',itemCaption:'スマホ対応のバイク用グローブ。'});
  const out=gen.inspectOutput({understood:true,product_summary:'バイク用グローブ',facts_used:['スマホ対応'],post_text:'バイク用グローブです。走行中にスマホを確認できます。停車中にスマホを確認する時、グローブを外す手間を減らせます。',hashtags:[]},input);
  assert.doesNotMatch(out.final.post_text,/走行中/);
  assert.match(out.final.post_text,/停車中/);
});

test('spatial-fit benefit requires explicit installation dimensions, not shoe or cable length',()=>{
  const shoe=gen.prepareInput({itemName:'スニーカー メンズ 27cm',itemCaption:'メンズ向けスニーカー。27cm。'});
  const a=gen.inspectOutput({understood:true,product_summary:'スニーカー',facts_used:['27cm'],post_text:'サイズは27cmです。置きたい場所に収まるか確認できます。',hashtags:[]},shoe);
  assert.match(a.final.post_text,/27cm/);
  assert.doesNotMatch(a.final.post_text,/置きたい場所/);
  const cable=gen.prepareInput({itemName:'アンテナケーブル 3m',itemCaption:'長さ3mのアンテナケーブル。'});
  const b=gen.inspectOutput({understood:true,product_summary:'アンテナケーブル',facts_used:['3m'],post_text:'長さ3mです。使うスペースに収まるか確認できます。',hashtags:[]},cable);
  assert.doesNotMatch(b.final.post_text,/使うスペース/);
  const box=gen.prepareInput({itemName:'衣類収納ケース 幅54cm',itemCaption:'幅54cm。衣類収納用。'});
  const c=gen.inspectOutput({understood:true,product_summary:'衣類収納ケース',facts_used:['幅54cm'],post_text:'幅54cmの衣類収納ケースです。置きたい場所に収まるか確認できます。',hashtags:[]},box);
  assert.match(c.final.post_text,/置きたい場所/);
});

test('malformed Japanese and translated vocabulary are removed sentence by sentence',()=>{
  const input=gen.prepareInput({itemName:'パンプス 本革 フラット',itemCaption:'本革のフラットパンプス。'});
  const out=gen.inspectOutput({understood:true,product_summary:'パンプス',facts_used:['本革'],post_text:'本革のパンプスです。フラットタイプでです。長度を確認できます。',hashtags:[]},input);
  assert.equal(out.final.post_text,'本革のパンプスです。');
  assert.equal(out.removedSentenceCount,2);
});

test('quantity does not invent consumable or refill-frequency claims',()=>{
  const input=gen.prepareInput({itemName:'耐熱手袋 4枚セット',itemCaption:'耐熱手袋4枚セット。'});
  const out=gen.inspectOutput({understood:true,product_summary:'耐熱手袋',facts_used:['4枚セット'],post_text:'耐熱手袋4枚セットです。消耗品なので買い足す回数を減らせます。複数をまとめて用意したい時に使えます。',hashtags:[]},input);
  assert.doesNotMatch(out.final.post_text,/消耗品|買い足す/);
  assert.match(out.final.post_text,/まとめて用意/);
});

test('sensitive genres add legal-care instruction without blocking generation',()=>{
  const input=gen.prepareInput({itemName:'美容ローラー',genreId:'100939'});
  const prompt=gen.systemPrompt(input);
  assert.match(prompt,/医療・美容・健康/);
  assert.match(prompt,/断定せず/);
  assert.match(prompt,/一般的な使用場面/);
});

test('runtime endpoint has one new generator path and no v3 value gate',()=>{
  const src=fs.readFileSync(path.join(__dirname,'../api/room-ai.js'),'utf8');
  assert.match(src,/room-post-generator-v1/);
  assert.doesNotMatch(src,/room-ai-v3/);
  assert.doesNotMatch(src,/needs_value/);
  assert.doesNotMatch(src,/qualityGate/);
  assert.doesNotMatch(src,/super-urenavi-router/);
});

test('runtime hashtag grounding blocks invented prefixes or suffixes',()=>{
  const roomAi=require('../api/room-ai');
  const input=gen.prepareInput({itemName:'膝サポーター 固定用',itemCaption:'膝まわりを固定するためのサポーター。'});
  assert.deepEqual(roomAi.groundedHashtags(['#膝サポーター','#Fixed膝サポーター','#固定用'],input,'膝サポーター'),['#膝サポーター','#固定用']);
});

test('single-pass prompt permits direct everyday benefits but bans inferred performance',()=>{
  const p=gen.systemPrompt(gen.prepareInput({itemName:'収納ボックス 50L',itemCaption:'折りたたみ可能'}));
  assert.match(p,/許される便益は一段だけ/);
  assert.match(p,/数値、仕様、性能、材質の性質、対応範囲、効果を創作・補完しない/);
  assert.match(p,/92g.*疲れにくい/);
  assert.match(p,/IPX4.*水洗いできる/);
  assert.match(p,/1℃単位.*味が安定する/);
  assert.match(p,/比較ポイント/);
});

test('product summary drops unsupported numeric claims and hashtag cleanup rejects foreign-script noise',()=>{
  const input=gen.prepareInput({itemName:'電気シェーバー 回転式 6枚刃',itemCaption:'USB充電'});
  const out=gen.inspectOutput({understood:true,product_summary:'最大20℃の電気シェーバー',facts_used:['6枚刃'],post_text:'6枚刃の電気シェーバーです。',hashtags:['#電気シェーバー','#العنايةの日','#USB充電']},input);
  assert.equal(out.final.product_summary,'');
  assert.deepEqual(out.final.hashtags,['#電気シェーバー','#USB充電']);
});

test('golden fixture stays fixed at 10 categories x 5 products',()=>{
  const rows=require('./fixtures/room-post-golden-50.json');
  assert.equal(rows.length,50);
  const counts=new Map();for(const row of rows)counts.set(row.category,(counts.get(row.category)||0)+1);
  assert.equal(counts.size,10);
  for(const n of counts.values())assert.equal(n,5);
  assert.ok(rows.some(x=>x.imageOnly));
  assert.ok(rows.some(x=>x.sensitive));
  assert.ok(rows.some(x=>x.numericHeavy));
  assert.ok(rows.some(x=>x.variantRisk));
  assert.ok(rows.some(x=>x.bundle));
  assert.ok(rows.some(x=>x.pastFailure));
});
