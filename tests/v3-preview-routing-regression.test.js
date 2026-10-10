'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const roomV3=require('../api/room-ai-v3');

function response(){
  return {
    headers:{},
    status(code){this.code=code;return this;},
    setHeader(k,v){this.headers[k]=v;},
    json(body){this.body=body;return body;}
  };
}

test('Preview UI has one active V3 contract and blocks dormant contracts',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../public/app.html'),'utf8');
  assert.match(html,/function isV3PreviewResult\(result\)/);
  assert.match(html,/startsWith\('super-urenavi-v3-'\)/);
  assert.doesNotMatch(html,/version==='super-urenavi-v3-preview'/);
  assert.match(html,/unexpected_ai_contract/);
  assert.match(html,/if\(String\(result\?\.version\|\|''\)\.startsWith\('room_contract_'\)\) return '';/);
  assert.doesNotMatch(
    html,
    /startsWith\('super-urenavi-v3-'\)\|\|String\(ai\.data\?\.version\|\|''\)\.startsWith\('room_contract_'\)/
  );
});

test('active V3 endpoint is isolated from the dormant semantic engine',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../api/room-ai-v3.js'),'utf8');
  assert.doesNotMatch(source,/room-semantic-engine|room-semantic-provider/);
});

test('tier A without a composed variant is not reported as ready',async()=>{
  const old=process.env.VERCEL_ENV;
  process.env.VERCEL_ENV='preview';
  try{
    const handler=roomV3.createHandler({
      authorize:async()=>({ok:true,plan:'owner'}),
      namespaced:false,
      store:{loadProduct:async()=>null,saveProduct:async()=>{}},
      groq:{callPass1(){},callPass2(){}},
      analyzeProductV3:async()=>({
        ok:false,
        source:'pass1+pass2',
        cacheStatus:'miss',
        validation:{
          valid:true,
          productType:{valid:true,specific:'洗濯ネット'},
          attributes:[{quote:'8枚セット'}],
          decisionAxes:[]
        },
        verifiedAppeals:[],
        pass2Status:'generated',
        groq:{pass1Calls:1,pass2Calls:1,totalCalls:2}
      }),
      composeVariants:()=>({
        tier:'A',
        variants:[],
        quality:{status:'blocked',text:'',reasons:['copy_not_ready'],ledger:[]}
      })
    });
    const res=response();
    await handler({
      method:'POST',
      body:{evaluationRun:'routing-regression',itemName:'洗濯ネット 8枚セット'}
    },res);
    assert.equal(res.code,200);
    assert.equal(res.body.ok,false);
    assert.equal(res.body.tier,'A');
    assert.equal(res.body.quality.status,'blocked');
    assert.equal(res.body.quality.text,'');
    assert.deepEqual(res.body.variants,[]);
  }finally{
    if(old===undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV=old;
  }
});

test('ready V3 response preserves publication ledger and exactly one rendered variant',async()=>{
  const old=process.env.VERCEL_ENV;
  process.env.VERCEL_ENV='preview';
  try{
    const text='大物の寝具を出し入れしやすくしたいとき。\n\nロングファスナーで開口部が大きい洗濯ネットです。\n\n※アフィリエイト広告を利用しています';
    const ledger=[{role:'primary_reason',scene:'大物の寝具を出し入れしやすくしたいとき',text:'ロングファスナーで開口部が大きい洗濯ネットです。',facts:[{quote:'口が大きく開くので寝具等の大物でも出し入れがしやすいロングファスナーを使用しています。',source:'itemCaption'}]}];
    const handler=roomV3.createHandler({
      authorize:async()=>({ok:true,plan:'owner'}),
      namespaced:false,
      store:{loadProduct:async()=>null,saveProduct:async()=>{}},
      groq:{callPass1(){},callPass2(){}},
      analyzeProductV3:async()=>({
        ok:true,
        source:'pass1+pass2',
        cacheStatus:'miss',
        validation:{
          valid:true,
          productType:{valid:true,specific:'洗濯ネット'},
          attributes:[{quote:'口が大きく開くので寝具等の大物でも出し入れがしやすいロングファスナーを使用しています。'}],
          decisionAxes:[]
        },
        verifiedAppeals:[{verification:{supported:true}}],
        pass2Status:'generated',
        groq:{pass1Calls:1,pass2Calls:1,totalCalls:2}
      }),
      composeVariants:()=>({
        tier:'A',
        variants:[{index:1,hookType:'scene',text}],
        quality:{status:'ready',text,reasons:[],ledger}
      })
    });
    const res=response();
    await handler({
      method:'POST',
      body:{evaluationRun:'routing-ready',itemName:'洗濯ネット',itemCaption:'口が大きく開くので寝具等の大物でも出し入れがしやすいロングファスナーを使用しています。'}
    },res);
    assert.equal(res.code,200);
    assert.equal(res.body.ok,true);
    assert.equal(res.body.quality.status,'ready');
    assert.equal(res.body.quality.text,text);
    assert.deepEqual(res.body.quality.ledger,ledger);
    assert.equal(res.body.variants.length,1);
    assert.equal(res.body.variants[0].text,text);
  }finally{
    if(old===undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV=old;
  }
});


test('V3 blocks a display variant different from verified publication text',async()=>{
  const old=process.env.VERCEL_ENV;
  process.env.VERCEL_ENV='preview';
  try{
    const handler=roomV3.createHandler({
      authorize:async()=>({ok:true,plan:'owner'}),namespaced:false,
      store:{loadProduct:async()=>null,saveProduct:async()=>{}},
      groq:{callPass1(){},callPass2(){}},
      analyzeProductV3:async()=>({
        ok:true,source:'pass1+pass2',cacheStatus:'miss',
        validation:{valid:true,productType:{valid:true,specific:'洗濯ネット'},attributes:[],decisionAxes:[]},
        verifiedAppeals:[],pass2Status:'generated',
        groq:{pass1Calls:1,pass2Calls:1,totalCalls:2}
      }),
      composeVariants:()=>({
        tier:'A',variants:[{index:1,hookType:'scene',text:'根拠が確認されていない別の本文'}],
        quality:{status:'ready',text:'検証済みの正しい本文',reasons:[],ledger:[]}
      })
    });
    const res=response();
    await handler({method:'POST',body:{evaluationRun:'mismatch-guard',itemName:'洗濯ネット'}},res);
    assert.equal(res.code,200);
    assert.equal(res.body.ok,false);
    assert.equal(res.body.quality.status,'blocked');
    assert.equal(res.body.quality.text,'');
    assert.deepEqual(res.body.variants,[]);
  }finally{
    if(old===undefined)delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV=old;
  }
});

test('stale legacy generatedCopy is never a publication source in active V3 Preview',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../public/app.html'),'utf8');
  assert.match(html,/function readyV3Post\(result\)/);
  assert.match(html,/return String\(result\?\.variants\?\.\[0\]\?\.text\|\|''\)\.trim\(\);/);
  assert.match(html,/if\(gate\.full\) return aiPhase1Post\(item,aiRoomResults\.get\(index\)\?\.data\);/);
  assert.doesNotMatch(html,/item\?\.generatedCopy|item\.generatedCopy/);
});


test('restored search results never auto-run V3 AI',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../public/app.html'),'utf8');
  assert.match(html,/render\(state\.items,\{autoAi:false,restored:true\}\)/);
  assert.match(html,/if\(aiGatesFullOutput&&autoAi\)\{\s*runAiPreview\(a\);/);
  assert.match(html,/ai\.state==='restored'/);
  assert.match(html,/current\?\.state==='restored'/);
  assert.match(html,/前回の検索結果です。AI再確認は自動実行していません。/);
});


test('mobile AI queue blocks premature debug export and can resume unfinished active work',()=>{
  const html=fs.readFileSync(path.join(__dirname,'../public/app.html'),'utf8');
  assert.match(html,/let aiQueueRunning=false;/);
  assert.match(html,/function activeAiProgress\(\)/);
  assert.match(html,/function resumeActiveAiQueue\(\)/);
  assert.match(html,/runAiPreview\(lastSearchItems,\{resume:true\}\)/);
  assert.match(html,/if\(progress\.pending>0\)\{/);
  assert.match(html,/最終結果になるまでJSONはコピーできません/);
  assert.match(html,/setTimeout\(resumeActiveAiQueue,500\)/);
  assert.match(html,/async function runAiPreview\(items,\{resume=false\}=\{\}\)/);
});
