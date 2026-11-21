'use strict';

const assert=require('node:assert/strict');
const test=require('node:test');
const {createRouterHandler}=require('../api/room-ai');
const retiredHandler=require('../api/room-ai-v3');

function response(){
  return {
    setHeader(){},
    status(code){this.code=code;return this;},
    json(body){this.body=body;return this;}
  };
}

test('mobile API produces exact source-backed copy before a cached result, with no provider request',async t=>{
  const previous=process.env.VERCEL_ENV;
  process.env.VERCEL_ENV='preview';
  t.after(()=>{
    if(previous===undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV=previous;
  });
  const claim='温度を5段階に設定できるので、飲み物に合わせてお湯の温度を調整できます。';
  const itemCaption='説明。'.repeat(450)+'電気ケトルは、'+claim;
  const writes=[];
  const capacityGate=t.mock.fn();
  const handler=createRouterHandler({
    authorize:async()=>({ok:true,plan:'owner'}),
    capacityGate,
    store:{
      loadProduct:async()=>({raw_ai_json:{},result_status:'unknown'}),
      saveProduct:async row=>writes.push(row)
    }
  });
  const res=response();
  await handler({method:'POST',body:{itemName:'電気ケトル',itemCaption,itemPrice:3480}},res);
  assert.equal(res.code,200);
  assert.equal(res.body.route.route,'local');
  assert.ok(res.body.sourceCopy.text.includes(claim));
  for(const span of res.body.sourceCopy.proof.evidence){
    assert.equal(itemCaption.slice(span.start,span.end),span.quote);
  }
  assert.equal(writes[0].itemCaption,itemCaption);

  const negative=response();
  await handler({method:'POST',body:{
    itemName:'電気ケトル',
    itemCaption:'説明。関連商品はこちら。電気ケトルは、'+claim,
    localOnly:true
  }},negative);
  assert.equal(negative.code,200);
  assert.equal(negative.body.sourceCopy,null);
  assert.equal(capacityGate.mock.calls.length,0);
});

test('retired experiment returns 410 without exercising its provider factory',async()=>{
  const res=response();
  await retiredHandler({method:'POST',body:{}},res);
  assert.equal(res.code,410);
});

test('source relations bind merchant headings and keep exact spans across numbered bullets',()=>{
  const {inspect,composeSourceCopy}=require('../lib/urenavi-core/source-purchase-relations');
  const item={
    itemName:'収納ボックス 40L',
    itemCaption:'商品説明 収納ボックスの特徴 1）外寸50cm 2）5面から取り出せるので大きな荷物を取り出しやすい。'
  };
  const copy=composeSourceCopy(item,'収納ボックス');
  assert.match(copy?.text||'',/5面から取り出せるので、大きな荷物を取り出しやすい。/);
  assert.equal(copy.proof.literal.quote,'5面から取り出せるので大きな荷物を取り出しやすい。');
  for(const span of copy.proof.evidence){
    assert.equal(item.itemCaption.slice(span.start,span.end),span.quote);
  }
  for(const boundary of ['関連商品','別売のカバー','タイプB']){
    const disjoint={...item,itemCaption:item.itemCaption.replace('2）','2）'+boundary+' ●')};
    assert.equal(inspect(disjoint,'収納ボックス').length,0,boundary);
  }
});

test('continuation does not borrow a feature from a previous numbered item',()=>{
  const {inspect}=require('../lib/urenavi-core/source-purchase-relations');
  const item={itemName:'収納ボックス',itemCaption:'商品説明 収納ボックスの特徴 1）取り外せる仕切りが付いています。 2）そのため、大きな荷物も取り出せます。'};
  assert.equal(inspect(item,'収納ボックス').length,0);
});

test('search text preserves a declared product and its source-backed use without a dictionary entry',async t=>{
  const previous=process.env.VERCEL_ENV;
  process.env.VERCEL_ENV='preview';
  t.after(()=>{
    if(previous===undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV=previous;
  });
  const {searchCaptionText}=require('../lib/urenavi-core/source-passages');
  const claim='棚の幅を調整できるので、置く場所に合わせて使えます。';
  const caption=searchCaptionText('<table><tr><th>商品名</th><td>窓辺ラック</td></tr></table><p>商品説明</p><p>'+claim+'</p>');
  const capacityGate=t.mock.fn();
  const handler=createRouterHandler({
    authorize:async()=>({ok:true,plan:'owner'}),
    capacityGate,
    store:{loadProduct:async()=>null,saveProduct:async()=>{}}
  });
  const item={itemName:'窓辺ラック 木製',itemCaption:caption,localOnly:true};
  const res=response();
  await handler({method:'POST',body:item},res);
  assert.equal(res.body.validation.productType.value,'窓辺ラック');
  assert.equal(res.body.cache.stored,false);
  assert.ok(res.body.sourceCopy.text.includes(claim));
  assert.equal(res.body.sourceCopy.proof.evidence[0].quote,'商品名 窓辺ラック');
  for(const itemCaption of [
    caption.replace(claim,'類似商品です。'),
    caption.replace(claim,'別売の棚板です。'+claim),
    caption.replace(claim,'別タイプの説明です。'+claim),
    caption.replace('商品説明','商品名 壁面ラック\n商品説明')
  ]){
    const refused=response();
    await handler({method:'POST',body:{...item,itemCaption}},refused);
    assert.equal(refused.body.sourceCopy,null);
  }
  assert.equal(capacityGate.mock.calls.length,0);
});
