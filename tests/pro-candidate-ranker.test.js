'use strict';
const assert=require('node:assert/strict');
const {rankProductCandidates}=require('../lib/pro-search');

const items=[
  {itemCode:'shop:1',itemName:'収納ボックス 折りたたみ',itemPrice:2200,reviewCount:200,reviewAverage:4.5,affiliateRate:4,itemCaption:'折りたたみ収納',itemUrl:'https://item.rakuten.co.jp/shop/1/'},
  {itemCode:'shop:2',itemName:'収納ボックス フタ付き',itemPrice:3300,reviewCount:80,reviewAverage:4.2,affiliateRate:3,itemCaption:'フタ付き収納',itemUrl:'https://item.rakuten.co.jp/shop/2/'},
  {itemCode:'shop:3',itemName:'ペット用毛取りグローブ',itemPrice:1200,reviewCount:100,reviewAverage:4.4,affiliateRate:3,itemCaption:'抜け毛に使う',itemUrl:'https://item.rakuten.co.jp/shop/3/'},
  {itemCode:'shop:4',itemName:'ふるさと納税 返礼品',itemPrice:10000,reviewCount:300,reviewAverage:4.9,affiliateRate:5},
  {itemCode:'shop:5',itemName:'収納ボックス 大容量',itemPrice:2800,reviewCount:150,reviewAverage:4.6,affiliateRate:4}
];
const settings={product_keyword:'収納ボックス',genre_name:'収納用品',sort:'standard',sale_priority:false};
const result=rankProductCandidates(settings,items);
assert.equal(result.length,3);
assert.ok(result.every(x=>x.itemCode!=='shop:4'));
assert.ok(result.every(x=>Number.isFinite(x.score)&&Number.isFinite(x.sellability)&&Number.isFinite(x.profitability)));
assert.equal(result[0].itemName.includes('収納ボックス'),true);
assert.deepEqual(rankProductCandidates(settings,items),result,'deterministic results from identical source data');
const excluded=rankProductCandidates(settings,items,{excludeCodes:[result[0].itemCode]});
assert.ok(!excluded.some(x=>x.itemCode===result[0].itemCode));
assert.deepEqual(rankProductCandidates(settings,[]),[]);
console.log('pro-candidate-ranker.test.js: PASS (API-independent ranking)');

// API-free route must not call searchProducts, fetch, or the Rakuten API.
const fs=require('node:fs');
const api=fs.readFileSync(require.resolve('../api/pro'),'utf8');
const begin=api.indexOf("action==='rank-supplied'");
const end=api.indexOf("action==='preview'",begin);
assert.ok(begin>=0&&end>begin);
const handler=api.slice(begin,end);
assert.match(handler,/rankProductCandidates\(settings,source\)/);
assert.doesNotMatch(handler,/searchProducts\(|fetch\(/);
assert.match(handler,/apiCalls:0/);

const html=fs.readFileSync(require.resolve('../public/app.html'),'utf8');
assert.doesNotMatch(html,/id="proSuppliedInput"/);
assert.doesNotMatch(html,/id="proSuppliedRankBtn"/);
assert.doesNotMatch(html,/function proRankSupplied\(\)/);
console.log('Pro main UI does not require labor-intensive manual candidate entry');

assert.match(html,/id="proActivityType"/);
assert.match(html,/id="proActivityAdd"/);
assert.match(html,/function proAddActivity\(\)/);
assert.match(html,/function proReadActivities\(\)/);
assert.match(html,/function proExportActivities\(\)/);
assert.match(html,/localStorage\.setItem\(PRO_ACTIVITY_KEY/);
assert.match(html,/like_visit:'いいね回り'/);
assert.match(html,/follow_return:'フォロー返し'/);
assert.doesNotMatch(html,/data-pro-task="follow"/);
console.log('Pro engagement ledger has explicit user-recorded like/follow/post activity');

const guardedApi=fs.readFileSync(require.resolve('../api/pro'),'utf8');
assert.match(guardedApi,/action==='preview'\|\|action==='generate'/);
assert.match(guardedApi,/auth\.plan==='owner'&&process\.env\.VERCEL_ENV==='preview'/);
assert.match(guardedApi,/pro_rakuten_source_not_cleared/);
console.log('Paid Pro Rakuten API source is blocked until approved');

assert.match(html,/id="proDailyDashboard"/);
assert.match(html,/id="proRevenueToday"/);
assert.match(html,/id="proCommissionToday"/);
assert.match(html,/function proSaveRevenue\(\)/);
assert.match(html,/PRO_REVENUE_KEY='urenavi_pro_verified_revenue_v1'/);
assert.match(html,/proUpdateDashboard\(\)/);
console.log('Pro dashboard shows explicitly entered sales and engagement activity');
assert.match(html,/<h1>ウレナビ改<\/h1>/);
assert.doesNotMatch(html,/id="appModeNav"/);
assert.doesNotMatch(html,/id="normalModeBtn"/);
assert.doesNotMatch(html,/id="proModeBtn"/);
assert.match(html,/function setAppScreen\(\)/);
assert.match(html,/proEl\('normalScreen'\)\.classList\.remove\('off'\)/);
assert.match(html,/proEl\('proPanel'\)\.classList\.add\('on'\)/);
console.log('Single Urenavi interface shows product and ROOM workflow together');

assert.match(html,/proBooted=true;\s*proEl\('proMsg'\)\.textContent='';/);
assert.match(html,/catch\(e\)\{\s*\/\/ Allow recovery[\s\S]*?proBooted=false;/);
console.log('Mobile initialization remains retryable after transient failures');
