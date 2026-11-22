'use strict';

const assert=require('node:assert/strict');
const {beforeEach,afterEach,test}=require('node:test');
const {createHash}=require('node:crypto');
const {createHandler}=require('../api/search');
const {isModeAPreview}=require('../lib/mode-a-preview');
const saved={...process.env};

beforeEach(()=>{
  Object.assign(process.env,{
    VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'experiment/urenavi-groq-room-copy-20261122',
    VERCEL_GIT_COMMIT_SHA:'a'.repeat(40),URENAVI_MODE_A_PREVIEW:'enabled',
    URENAVI_MODE_A_APPROVED_SHA:'a'.repeat(40),RAKUTEN_AFFILIATE_ID:'fixture',
    RAKUTEN_APP_ID:'fixture',RAKUTEN_ACCESS_KEY:'fixture',
    URENAVI_MODE_A_AFFILIATE_HASH:createHash('sha256').update('fixture').digest('hex')
  });
});
afterEach(()=>{
  for(const k of Object.keys(process.env))if(!(k in saved))delete process.env[k];
  Object.assign(process.env,saved);
});

const item=n=>({itemName:'収納ケース '+n,itemCode:'shop:'+n,itemCaption:'ふた付き。',genreId:n,
 itemPrice:2000,itemUrl:'https://item.rakuten.co.jp/shop/'+n+'/',reviewCount:100,reviewAverage:4.3});
function fixture({owner=true,claimed=true,finish=true,response={items:[item(1),item(2),item(3)]},status=200}={}){
  const events=[];
  const handler=createHandler({
    authorize:async()=>({ok:true,plan:owner?'owner':'standard'}),
    attemptDb:async(path,{body})=>{const payload=JSON.parse(body);events.push([path,payload]);return path.includes('claim')?claimed:finish;},
    fetch:async(url,options)=>{events.push(['send',new URL(url),options]);return {ok:status===200,status,json:async()=>response};}
  });
  return {events,async request(slot,method='POST'){
    const res={setHeader(){},status(code){this.code=code;return this;},json(body){this.body=body;}};
    await handler({method,query:{},body:{slot,keyword:'not approved'}},res);
    return res;
  }};
}

test('Mode A reserves before its only dispatch, suppresses genre calls and settles before releasing results',async()=>{
  const {events,request}=fixture();
  assert.equal((await request(1)).code,200);
  assert.equal(events.length,3);
  assert.deepEqual(events[0],['rpc/urenavi_claim_mode_a_preview',{p_slot:1}]);
  assert.equal(events[1][1].searchParams.get('keyword'),'収納ケース 衣類 フタ付き');
  assert.equal(events[1][1].searchParams.get('minPrice'),'1500');
  assert.equal(events[1][1].searchParams.get('affiliateId'),'fixture');
  assert.equal(events[1][2].redirect,'error');
  assert.deepEqual(events[2],['rpc/urenavi_finish_mode_a_preview',{p_slot:1,p_has_three:true}]);
});

test('Mode A refuses GET, non-owner, invalid slot, wrong SHA and wrong affiliate ID before reservation',async()=>{
  const f=fixture();
  assert.equal((await f.request(1,'GET')).code,405);
  assert.equal((await f.request(5)).code,400);
  const client=fixture({owner:false});assert.equal((await client.request(1)).code,403);
  assert.deepEqual(client.events,[]);
  process.env.URENAVI_MODE_A_APPROVED_SHA='b'.repeat(40);
  assert.equal((await f.request(1)).code,403);
  process.env.URENAVI_MODE_A_APPROVED_SHA=process.env.VERCEL_GIT_COMMIT_SHA;
  process.env.RAKUTEN_AFFILIATE_ID='wrong';
  assert.equal((await f.request(1)).code,403);
  assert.deepEqual(f.events,[]);
  assert.equal(isModeAPreview({...process.env,VERCEL_ENV:'production'}),false);
});

test('Mode A stops on reservation rejection, upstream failure, malformed data or unconfirmed settlement',async()=>{
  for(const [options,status,count] of [
    [{claimed:false},409,1],
    [{status:429},429,2],
    [{response:{items:[{}]}},502,2],
    [{finish:false},503,3]
  ]){
    const f=fixture(options);
    const {code,body}=await f.request(1);
    assert.equal(code,status);
    assert.equal(f.events.length,count);
    assert.equal(body.items,undefined);
  }
});

test('Mode A blocks legacy AI, batch/search and purchase endpoints on this branch',async()=>{
  for(const path of ['room-ai','search-v2','pro','pro-genres','pro-cron','access']){
    const res={setHeader(){},status(code){this.code=code;return this;},json(){}};
    await require('../api/'+path)({method:'GET',query:{action:'buy'}},res);
    assert.equal(res.code,404,path);
  }
});

test('Mode A clipboard output contains five facts without invoking the post generator',()=>{
  const fs=require('node:fs'),vm=require('node:vm');
  const html=fs.readFileSync(require('node:path').resolve(__dirname,'../public/app.html'),'utf8');
  const a=html.indexOf('function modeACopyText('),b=html.indexOf('function renderModeA(',a);
  const ctx=vm.createContext({fmt:String});
  vm.runInContext(html.slice(a,b),ctx);
  assert.equal(ctx.modeACopyText(item(1)),[
    '商品名：収納ケース 1','価格：2000円','評価：4.3','レビュー件数：100件','商品URL：https://item.rakuten.co.jp/shop/1/'
  ].join('\n'));
});
