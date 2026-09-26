'use strict';

const assert=require('node:assert/strict');
const {analyzeProductV3,V3_SCHEMA_VERSION}=require('../lib/super-urenavi-v3-engine');

const item={
  itemCode:'shop:1',
  itemName:'電気ケトル 0.8L 50-100度 1℃単位',
  itemCaption:'容量0.8L。50-100度を1℃単位で設定できます。'
};
const pass1={
  productType:{specific:'電気ケトル',general:'ケトル',quote:'電気ケトル'},
  attributes:[
    {name:'容量',value:'0.8L',unit:'L',qualifier:'',valueType:'single',quote:'0.8L'},
    {name:'温度設定範囲',value:'50-100度',unit:'度',qualifier:'',valueType:'range',quote:'50-100度'},
    {name:'温度設定単位',value:'1℃',unit:'℃',qualifier:'単位',valueType:'single',quote:'1℃単位'}
  ],
  decisionAxes:[{text:'温度設定',attributeRefs:[1,2]}],
  appeals:[{text:'飲み物に合わせて温度を細かく選べる',noHassle:'沸かした後に温度が下がるのを待たなくていい',scene:'飲み物ごとに温度を変えたいとき',attributeRefs:[1,2],strength:3}],
  hooks:[{type:'question',text:'飲み物ごとに、お湯の温度を気にすることありませんか？'}]
};
const pass2={results:[{verificationIndex:0,supported:true,keepDirectFact:true,reason:'温度設定範囲と単位から無理なく言える'}]};

function memoryStore(initial=null){
  let row=initial;
  return {
    async loadProduct(){return row;},
    async saveProduct(x){
      row={schema_version:x.schemaVersion,raw_ai_json:x.rawAiJson,model:x.model,result_status:x.resultStatus};
    },
    get(){return row;}
  };
}

(async()=>{
  {
    const store=memoryStore();
    const quota=[];
    let p1=0,p2=0;
    const first=await analyzeProductV3({
      item,store,model:'mock',
      consumeQuota:async stage=>{quota.push(stage);return true;},
      callPass1:async()=>{p1++;return {raw:pass1,model:'mock'};},
      callPass2:async()=>{p2++;return {raw:pass2,model:'mock'};}
    });
    assert.equal(first.ok,true);
    assert.equal(first.groq.pass1Calls,1);
    assert.equal(first.groq.pass2Calls,1);
    assert.deepEqual(quota,['pass1','pass2']);
    assert.equal(p1,1); assert.equal(p2,1);
    assert.equal(store.get().schema_version,V3_SCHEMA_VERSION);

    quota.length=0;
    const second=await analyzeProductV3({
      item,store,model:'mock',
      consumeQuota:async stage=>{quota.push(stage);return true;},
      callPass1:async()=>{p1++;return {raw:pass1};},
      callPass2:async()=>{p2++;return {raw:pass2};}
    });
    assert.equal(second.source,'cache');
    assert.equal(second.groq.totalCalls,0);
    assert.deepEqual(quota,[]);
    assert.equal(p1,1); assert.equal(p2,1);
  }

  {
    const store=memoryStore();
    const direct={...pass1,appeals:[{text:'0.8L',noHassle:'',scene:'',attributeRefs:[0],strength:2}]};
    let p2=0;
    const r=await analyzeProductV3({
      item,store,
      consumeQuota:async()=>true,
      callPass1:async()=>({raw:direct}),
      callPass2:async()=>{p2++;return {raw:{results:[]}};}
    });
    assert.equal(r.groq.pass1Calls,1);
    assert.equal(r.groq.pass2Calls,0);
    assert.equal(p2,0);
  }

  {
    const store=memoryStore();
    let pass1Calls=0;
    await assert.rejects(()=>analyzeProductV3({
      item,store,
      consumeQuota:async stage=>stage==='pass1',
      callPass1:async()=>{pass1Calls++;return {raw:pass1,model:'mock'};},
      callPass2:async()=>({raw:pass2})
    }),e=>e?.status===429 && e?.stage==='pass2');
    assert.equal(pass1Calls,1);
    assert.ok(store.get()?.raw_ai_json?.pass1);
    assert.equal(store.get()?.raw_ai_json?.pass2,null);

    let retryPass1=0,retryPass2=0;
    const resumed=await analyzeProductV3({
      item,store,
      consumeQuota:async()=>true,
      callPass1:async()=>{retryPass1++;return {raw:pass1};},
      callPass2:async()=>{retryPass2++;return {raw:pass2};}
    });
    assert.equal(resumed.source,'cache+pass2');
    assert.equal(retryPass1,0);
    assert.equal(retryPass2,1);
    assert.equal(resumed.groq.totalCalls,1);
  }

  console.log('super-urenavi-v3-engine.test.js: PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
