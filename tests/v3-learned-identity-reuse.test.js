'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createCacheStore}=require('../lib/super-urenavi-cache');
const roomV3=require('../api/room-ai-v3');

function response(){
  return {
    code:0,body:null,headers:{},
    setHeader(k,v){this.headers[k]=v;},
    status(code){this.code=code;return this;},
    json(body){this.body=body;return body;}
  };
}

test('verified identity cache only reuses valid or explicit identity-only rows with exact title match',async()=>{
  const future=new Date(Date.now()+3600000).toISOString();
  const db=async path=>{
    if(String(path).startsWith('urenavi_product_type_knowledge_cache?')) return [
      {product_type:'卓上アイスメーカー',validation_status:'pending',raw_ai_json:{productType:'卓上アイスメーカー',identityLearned:true},expires_at:future},
      {product_type:'モニターライト',validation_status:'pending',raw_ai_json:{productType:'モニターライト'},expires_at:future},
      {product_type:'靴下',validation_status:'valid',raw_ai_json:{productType:'靴下'},expires_at:future}
    ];
    return [];
  };
  const store=createCacheStore(db);
  assert.equal(await store.findTypeIdentityInTitle('卓上アイスメーカー 1.5L 家庭用'),'卓上アイスメーカー');
  assert.equal(await store.findTypeIdentityInTitle('モニターライト USB給電'),'');
  assert.equal(await store.findTypeIdentityInTitle('靴下 10足セット'),'');
});

test('rememberValidatedIdentity stores only a verified concrete AI identity and reuses it',async()=>{
  let row=null,saves=0;
  const store={
    async loadTypeKnowledge(){return row;},
    async saveTypeKnowledge(input){
      saves++;
      row={validation_status:input.validationStatus,raw_ai_json:input.rawAiJson};
    }
  };
  const analysis={ok:true,validation:{productType:{valid:true,specific:'卓上アイスメーカー'}}};
  const first=await roomV3.rememberValidatedIdentity(store,analysis,'mock');
  assert.equal(first.status,'stored');
  assert.equal(row.validation_status,'pending');
  assert.equal(row.raw_ai_json.identityLearned,true);
  const second=await roomV3.rememberValidatedIdentity(store,analysis,'mock');
  assert.equal(second.status,'hit');
  assert.equal(saves,1);

  const rejected=await roomV3.rememberValidatedIdentity(store,{ok:false,validation:{productType:{valid:true,specific:'別商品タイプ'}}},'mock');
  assert.equal(rejected.status,'skipped');
});

test('learned identity can complete a grounded zero-call post but never turns an accessory into the whole product',()=>{
  const item={itemName:'卓上アイスメーカー 家庭用 1.5L 120W コンパクト',itemCaption:'',itemPrice:0};
  const learned=roomV3.localZeroCall(item,'卓上アイスメーカー');
  assert.ok(learned);
  assert.equal(learned.productType.specific,'卓上アイスメーカー');
  assert.equal(learned.groq.totalCalls,0);
  assert.match(learned.quality.text,/1\.5L|120W/);

  const accessory=roomV3.localZeroCall({itemName:'卓上アイスメーカー用 交換フィルター 2個入り',itemCaption:'',itemPrice:0},'卓上アイスメーカー');
  assert.equal(accessory,null);
});

test('preview handler consults learned identity after local miss and skips AI analysis when reuse is safe',async()=>{
  const oldEnv=process.env.VERCEL_ENV;
  process.env.VERCEL_ENV='preview';
  let analyzeCalls=0,localCalls=0;
  const store={
    async loadProduct(){return null;},async saveProduct(){},
    async findTypeIdentityInTitle(){return '卓上アイスメーカー';},
    async loadTypeKnowledge(){return null;},async saveTypeKnowledge(){}
  };
  const localResult={
    ok:true,pending:false,phase:'local',tier:'A',cacheStatus:'local',pass2Status:'not_needed',
    productType:{specific:'卓上アイスメーカー',valid:true},
    attributes:[{quote:'1.5L'}],decisionAxes:['容量'],verifiedAppeals:[],
    groq:{pass1Calls:0,pass2Calls:0,totalCalls:0},
    quality:{status:'ready',text:'卓上アイスメーカー\n\n特徴👇\n✓ 1.5L\n\n※アフィリエイト広告を利用しています',reasons:[]},
    variants:[{index:1,hookType:'identity',hook:'卓上アイスメーカー',text:'卓上アイスメーカー'}],
    local:{route:'local'}
  };
  const handler=roomV3.createHandler({
    authorize:async()=>({ok:true,plan:'owner'}),
    store,namespaced:false,
    localZeroCall:(_item,learned)=>{localCalls++;return learned==='卓上アイスメーカー'?structuredClone(localResult):null;},
    analyzeProductV3:async()=>{analyzeCalls++;throw new Error('must not call AI');}
  });
  const res=response();
  await handler({method:'POST',body:{itemCode:'learned-02',itemName:'卓上アイスメーカー 1.5L 家庭用'}},res);
  assert.equal(res.code,200);
  assert.equal(res.body.groq.totalCalls,0);
  assert.equal(res.body.local.learnedIdentity,'卓上アイスメーカー');
  assert.equal(analyzeCalls,0);
  assert.equal(localCalls,2);
  process.env.VERCEL_ENV=oldEnv;
});
