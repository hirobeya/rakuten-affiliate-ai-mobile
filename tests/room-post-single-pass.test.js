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
