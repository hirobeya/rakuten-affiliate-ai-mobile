'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const s=require('../public/structured-room-copy');
const fixtures=require('./fixtures/structured-copy-categories.json');
const window={};const ctx=vm.createContext({window,Intl,console,setInterval:()=>0,setTimeout:()=>0,clearInterval:()=>{},document:{}});
for(const name of ['structured-room-copy','fact-safety','pain-copy','room-copy-quality']) vm.runInContext(fs.readFileSync('public/'+name+'.js','utf8'),ctx);
const api=window.UrenaviPainCopy;
const posts=[];
for(const item of fixtures){
 const r=s.compose(item),post=api.makeRoomCopy(item,'');
 assert.equal(r.status,'ok',item.category+': '+r.status);
 assert.ok(post,item.category);
 assert.equal(post,api.buildGroundedBenefitPost(item,[]));
 assert.equal(post,api.buildValidatedProductPost(item,r.understanding.identity,r.facts.map(x=>x.quote)));
 assert.equal(post,api.makeThreadsCopy(item,''));
 assert.doesNotMatch(post,/商品名には|明記されています|比較しやすい商品|素材を見て|快適|便利|改善|治る|臭わない|効能/);
 assert.ok(post.length>50&&post.length<=500);
 assert.match(post,/アフィリエイト広告/);
 assert.equal(new Set(r.facts.map(x=>x.quote)).size,r.facts.length);
 for(const f of r.facts) assert.ok(String(item[f.source]||'').includes(f.quote));
 for(const v of r.values) assert.ok(r.facts.some(x=>x.quote===v.factRef&&x.source===v.source));
 posts.push(post);
}
assert.equal(new Set(posts).size,fixtures.length);
const glove=s.compose(fixtures[0]);assert.match(glove.text,/停車中/);assert.doesNotMatch(glove.text,/操作中も|レザー|本革|2XL|XXXL/);assert.match(glove.text,/山羊革|防風|風対策/);assert.match(glove.text,/オールシーズン/);
const adverse=[
 ['バイクグローブ 非 スマホ対応 防風ではない レザー 調',[]],
 ['バイクグローブ スマホ対応 ではありません',[]],
 ['バイクグローブ 非防水 防水風 フェイク レザー',[]],
 ['モバイルバッテリー USB-C 非対応',[]],
 ['タオル 2個ご購入で送料無料 3個で送料無料 2個から 1個あたり 2個目半額',[]],
 ['モバイルバッテリー 10000mAh 20000mAh USB-C',['USB-C']],
 ['バイクグローブ 山羊革 牛革 スマホ対応',['スマホ対応']],
 ['フライパン スマホ対応',['スマホ対応']]
];
for(const [itemName,want] of adverse){const facts=s.extractFacts({itemName});assert.deepEqual(facts.map(x=>x.quote),want,itemName);}
assert.equal(s.compose({itemName:'モバイルバッテリー用ケース USB-C'}).text,'');
assert.equal(s.compose({itemName:'収納ベンチ モバイルバッテリー 木製'}).text,'');
assert.equal(s.compose({itemName:'フライパン スマホ対応'}).values.length,0);
assert.equal(s.compose({itemName:'美顔ローラー 小顔 リフトアップ'}).text,'');
assert.equal(s.compose({itemName:'架空品'},{identity:'掃除機',evidence:['本革']}).text,'');
assert.doesNotMatch(s.compose({itemName:'バイクグローブ 山羊革'},{evidence:['防風','スマホ対応']}).text,/風対策|スマホ/);
console.log('Structured copy: 15 categories + 14 adverse/guard cases PASS');

// Unknown product types retain source identity without invented scenes or material roles.
const unknown=s.compose({itemName:'腕時計 レザー 3個セット'});
assert.equal(unknown.status,'ok');
assert.equal(unknown.understanding.method,'source_label');
assert.equal(unknown.understanding.scene,'');
assert.doesNotMatch(unknown.text,/レザーを使った|比較|確認できます/);
for(const e of unknown.understanding.identityEvidence) assert.ok('腕時計 レザー 3個セット'.includes(e.quote));
assert.match(s.compose({itemName:'プリンター WiFi 1セット'}).text,/プリンター/);
const combined=s.compose({itemName:'掃除機 コードレス 充電式'});
assert.equal(combined.values.length,1);
assert.deepEqual(combined.values[0].factRefs,['コードレス','充電式']);
assert.doesNotMatch(combined.text,/✓ コードレス|✓ 充電式/);
assert.doesNotMatch(s.compose({itemName:'Tシャツ 綿100% オールシーズン'}).text,/綿100%を使った/);
assert.equal(s.compose({itemName:'モバイルバッテリー用ケース USB-C'}).status,'insufficient_evidence');
console.log('Source label, material role, accessory and combined value regressions PASS');
