'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {boundedSource}=require('../lib/product-source');
const search=require('../api/search');
const {createHandler}=require('../lib/room-copy-handler');
function response(){return {code:0,data:null,setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};}

test('source bounds preserve complete evidence and never retain half a negative clause',()=>{
  const caption='説明。'.repeat(410)+'カバーのみ洗濯可能。本体は洗濯不可。';
  assert.equal(boundedSource(caption,12000),caption);
  assert.equal(boundedSource('対応。'+'あ'.repeat(494)+'防水不可',500),'対応。');
  assert.equal(boundedSource('あ'.repeat(498)+'防水不可',500),'');
  assert.equal(boundedSource('<p>カバーのみ洗濯可能。</p><p>本体不可。</p>',12000),'カバーのみ洗濯可能。 本体不可。');
});

test('search carries evidence after character 1200 into generation sources',async()=>{
  const oldFetch=global.fetch;
  const oldEnv=Object.fromEntries(['RAKUTEN_APP_ID','RAKUTEN_ACCESS_KEY','RAKUTEN_AFFILIATE_ID'].map(k=>[k,process.env[k]]));
  for(const k of Object.keys(oldEnv))process.env[k]='test';
  const itemCaption='商品説明。'.repeat(250)+'カバーのみ洗濯可能。本体は洗濯不可。';
  const catchcopy='カバーを外して洗える収納ボックス';
  global.fetch=async()=>({ok:true,json:async()=>({items:[{itemCode:'source:transport',itemName:'収納ボックス',itemCaption,catchcopy,itemPrice:1000,genreId:''}]})});
  try{
    const res=response();
    await search.createHandler({authorize:async()=>({ok:true,user:{id:'source-user'}}),claimSearch:async()=>true})({method:'GET',query:{keyword:'収納ボックス'}},res);
    assert.equal(res.code,200);
    assert.equal(res.data.items[0].itemCaption,itemCaption);
    assert.equal(res.data.items[0].catchcopy,catchcopy);
  }finally{global.fetch=oldFetch;for(const [k,v]of Object.entries(oldEnv))if(v===undefined)delete process.env[k];else process.env[k]=v;}
});

test('oversize or non-text catchcopy is rejected before local/provider processing',async()=>{
  const env=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';let calls=0;
  try{
    const handler=createHandler({authorize:async()=>({ok:true,plan:'owner',user:{email:'owner@example.test'}}),store:{},localZeroCall:()=>{calls++;return null;}});
    for(const catchcopy of ['あ'.repeat(498)+'防水不可',{claim:'防水'}]){
      const res=response();await handler({method:'POST',body:{itemName:'収納ボックス',itemCaption:'',catchcopy}},res);
      assert.equal(res.code,400);assert.equal(calls,0);
    }
  }finally{if(env===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=env;}
});

test('integrated candidate ranking retains late source conditions just like normal search',()=>{
  const {rankProductCandidates}=require('../lib/pro-search');
  const itemCaption='<p>'+('商品説明。'.repeat(250))+'カバーのみ洗濯可能。本体は洗濯不可。</p>';
  const catchcopy='対応。'+'あ'.repeat(494)+'防水不可';
  const [candidate]=rankProductCandidates({product_keyword:'収納ボックス'},[{itemCode:'source:integrated',itemName:'収納ボックス',itemPrice:1000,itemCaption,catchcopy}]);
  assert.equal(candidate.itemCaption,boundedSource(itemCaption,12000));
  assert.ok(candidate.itemCaption.endsWith('本体は洗濯不可。'));
  assert.equal(candidate.catchcopy,'対応。');
  assert.ok(!candidate.catchcopy.endsWith('防水'));
});
