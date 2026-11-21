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
