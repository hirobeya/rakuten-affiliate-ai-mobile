const {test,afterEach}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const request=require('../public/request');
const originalFetch=global.fetch;
afterEach(()=>{global.fetch=originalFetch;});
test('a stalled fetch is aborted and the caller can retry',async()=>{
  let signal;
  global.fetch=async(url,options)=>{signal=options.signal;return new Promise(()=>{});};
  await assert.rejects(request.json('/search',{},5),/時間内/);
  assert.equal(signal.aborted,true);
  global.fetch=async()=>({ok:true,json:async()=>({items:[]})});
  assert.deepEqual((await request.json('/search')).data,{items:[]});
});
test('deadline includes a stalled response body',async()=>{
  global.fetch=async()=>({ok:true,json:()=>new Promise(()=>{})});
  await assert.rejects(request.json('/search',{},5),/時間内/);
});
test('invalid JSON gives an actionable error',async()=>{
  global.fetch=async()=>({ok:true,json:async()=>{throw Error('bad json');}});
  await assert.rejects(request.json('/search'),/読み取れません/);
});
const html=fs.readFileSync(require.resolve('../public/app.html'),'utf8');
test('ROOM search keeps platform and product variant identifiers',()=>{
  const context=vm.createContext({URLSearchParams});
  vm.runInContext(html.slice(html.indexOf('function roomSearchUrl('),html.indexOf('function roomAction(')),context);
  for(const title of ['【PS5】ゲーム','Nintendo Switch（有機ELモデル）','ボトル 500ml（ブラック）']){
    const keyword=new URL(context.roomSearchUrl({itemName:title})).searchParams.get('keyword');
    assert.equal(keyword,title.replace('【PS5】','PS5'));
  }
});
test('disabled history storage cannot interrupt successful searches',()=>{
  const context=vm.createContext({hist:()=>[],H:'history',localStorage:{setItem(){throw Error('quota');}}});
  vm.runInContext(html.slice(html.indexOf('function saveH('),html.indexOf('function aud(')),context);
  assert.doesNotThrow(()=>context.saveH({k:'ゼルダ'}));
});
test('ROOM-only UI and fallback copy do not expose operator affiliate links',()=>{
  assert.doesNotMatch(html,/data-p="(?:threads|instagram)"/);
  const context=vm.createContext({safeUrl:x=>x,fmt:String,aud:()=>'',pts:()=>['商品情報']});
  vm.runInContext(html.slice(html.indexOf('function post('),html.indexOf('function short(')),context);
  const copy=context.post({itemName:'商品',itemPrice:1000,itemUrl:'https://example.test/item',affiliateUrl:'https://example.test/operator'});
  assert.doesNotMatch(copy,/https:\/\//);
  assert.match(copy,/アフィリエイト広告/);
});
test('game and book copy describes the product instead of promising household time savings',()=>{
  const window={};const context=vm.createContext({window});
  for(const file of ['pain-copy.js','pain-copy-refine.js','pain-copy-context-fix.js'])vm.runInContext(fs.readFileSync(require.resolve('../public/'+file),'utf8'),context);
  for(const [name,expected] of [['ゼルダの伝説 時のオカリナ','対応機種'],['改訂版 お金の大学','一冊'],['商品XYZ','商品情報']]){
    const copy=window.UrenaviPainCopy.makeRoomCopy({itemName:name,itemPrice:1000,reviewCount:0},name);
    assert.match(copy,new RegExp(expected));assert.doesNotMatch(copy,/面倒な作業を減ら|小さな手間を減ら|https:\/\//);
  }
});
