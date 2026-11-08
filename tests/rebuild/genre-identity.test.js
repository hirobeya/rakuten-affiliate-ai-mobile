'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {genreIdentity}=require('../../lib/urenavi-core/genre-identity');
const {generate}=require('../../lib/urenavi-core/last-resort');
test('Rakuten genre is only a title-matching hypothesis, not a claim',()=>{
 const r=genreIdentity({itemName:'靴下 メンズ 5足組 コットン',genreName:'靴下',genrePath:'メンズファッション > 靴下'});
 assert.equal(r?.identity,'靴下');assert.equal(r?.publishable,false);
 assert.equal(r?.proof,'exact_title_and_genre_overlap');
});
test('genre that is absent, misleading or an accessory cannot assert product identity',()=>{
 for(const x of [
  {itemName:'洗濯ネット 6枚組',genreName:'サプリメント',genrePath:'サプリメント'},
  {itemName:'スマホ ケース iPhone用',genreName:'ケース',genrePath:'スマートフォン > ケース'},
  {itemName:'靴下 5足セット',genreName:'セット',genrePath:'セット'},
  {itemName:'白米 令和7年産100%使用',genreName:'令和7年産100%使用',genrePath:'食品 > 令和7年産100%使用'},
  {itemName:'ペットベッド',genreName:'ペットベッド',genrePath:'キッチン用品 > ベッド'}
 ])assert.equal(genreIdentity(x),null,JSON.stringify(x));
});
test('genre metadata never overrides existing ready or changes Groq call count',()=>{
 const item={itemCode:'local:test',itemName:'シャツ用洗濯ネット',itemCaption:'シャツを巻いて洗うことで、洗濯中のかたよりを抑えます。',catchcopy:'',genreName:'洗濯ネット',genrePath:'日用品 > 洗濯ネット',itemPrice:1300};
 const a=generate(item),b=generate({...item,genreName:'その他',genrePath:'その他'});
 assert.equal(a.groqCalls,0);assert.equal(b.groqCalls,0);
 assert.equal(a.baseline?.quality?.text,b.baseline?.quality?.text);
});
test('genre metadata cannot create a publishable copy without source-grounded purchase reason',()=>{
 const x=generate({itemCode:'test:genre',itemName:'靴下 メンズ 5足セット',itemCaption:'靴下。',catchcopy:'',genreName:'靴下',genrePath:'ファッション > 靴下',itemPrice:500});
 assert.equal(x.groqCalls,0);assert.equal(x.result,null);
 assert.equal(x.qualityCertified,false);
});
