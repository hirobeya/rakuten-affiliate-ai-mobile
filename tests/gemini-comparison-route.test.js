'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../lib/room-writer-raw/gemini-preview-route');

function response(){
  return {statusCode:200, headers:{},body:null,
    setHeader(k,v){this.headers[k]=v;},
    status(n){this.statusCode=n;return this;},
    json(obj){this.body=obj;return this;}
  };
}
test('all four fixed public source captures are available',()=>{
  assert.equal(handler.loadItem('3').itemCode,'shopworld:10138423');
  assert.equal(handler.loadItem('4').itemCode,'arkham:10000161');
  assert.equal(handler.loadItem('5').itemCode,'besthouse:10000083');
  assert.equal(handler.loadItem('6').itemCode,'e-kitchen:10079039');
  assert.equal(handler.loadItem('99'),null);
  assert.equal(handler.loadItem('../../.env'),null);
});
test('cross-origin POST is refused without a provider call',async()=>{
  const oldEnv=process.env.VERCEL_ENV,oldBranch=process.env.VERCEL_GIT_COMMIT_REF;
  process.env.VERCEL_ENV='preview';
  process.env.VERCEL_GIT_COMMIT_REF='experiment/urenavi-gemini-comparison-20261113';
  try{
    const res=response();
    await handler({method:'POST',headers:{origin:'https://attacker.example',host:'safe.vercel.app'},body:{id:'3',confirm:'single-free-tier-call'}},res);
    assert.equal(res.statusCode,403);
    assert.equal(res.body.error,'origin_rejected');
  }finally{
    if(oldEnv===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=oldEnv;
    if(oldBranch===undefined)delete process.env.VERCEL_GIT_COMMIT_REF;else process.env.VERCEL_GIT_COMMIT_REF=oldBranch;
  }
});
test('production and unexpected branches fail closed',async()=>{
  const oldEnv=process.env.VERCEL_ENV,oldBranch=process.env.VERCEL_GIT_COMMIT_REF;
  try{
    for(const [env,branch] of [['production','main'],['preview','other-branch']]){
      process.env.VERCEL_ENV=env;process.env.VERCEL_GIT_COMMIT_REF=branch;
      const res=response();await handler({method:'POST',headers:{},body:{id:'3'}},res);
      assert.equal(res.statusCode,404);
    }
  }finally{
    if(oldEnv===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=oldEnv;
    if(oldBranch===undefined)delete process.env.VERCEL_GIT_COMMIT_REF;else process.env.VERCEL_GIT_COMMIT_REF=oldBranch;
  }
});
test('evidence report checks direct quote inclusion, never claims semantic review',()=>{
 const item=handler.loadItem('3');
 assert.equal(handler.citationsPresent({product:{basis:[{field:'itemCaption',quote:'ベンチや踏み台としても使える'}]}},item),true);
 assert.equal(handler.citationsPresent({product:{basis:[{field:'itemCaption',quote:'架空の万能性能'}]}},item),false);
});

async function withPreview(fn){
 const keys=['VERCEL_ENV','VERCEL_GIT_COMMIT_REF','GEMINI_PRIOR_ATTEMPTS_RECONCILED','GEMINI_API_KEY'];
 const before=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 Object.assign(process.env,{VERCEL_ENV:'preview',VERCEL_GIT_COMMIT_REF:'experiment/urenavi-gemini-comparison-20261113',GEMINI_API_KEY:'mock-only'});
 delete process.env.GEMINI_PRIOR_ATTEMPTS_RECONCILED;
 try{await fn();}finally{for(const k of keys)if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}
}
const request=()=>({method:'POST',headers:{origin:'https://safe.vercel.app',host:'safe.vercel.app'},body:{id:'3',confirm:'single-free-tier-call'}});
test('unauthenticated and nonowner requests cannot claim or send',()=>withPreview(async()=>{
 for(const access of [{ok:false},{ok:true,plan:'base'}]){
 const h=handler.createHandler({authorizeImpl:async()=>access,storeFactory:()=>{throw Error('must not claim');},compare:()=>{throw Error('must not send');}});
 const res=response();await h(request(),res);assert.equal(res.statusCode,403);
 }
}));
test('unknown historical consumption blocks a new call with null usage',()=>withPreview(async()=>{
 const h=handler.createHandler({authorizeImpl:async()=>({ok:true,plan:'owner'}),storeFactory:()=>{throw Error('must not claim');}});
 const res=response();await h(request(),res);assert.equal(res.statusCode,409);assert.equal(res.body.tokens,null);
 assert.equal(res.body.error,'prior_consumption_unknown_no_resend');
}));
test('timeout is saved as unknown, duplicate and concurrent sends are refused',()=>withPreview(async()=>{
 process.env.GEMINI_PRIOR_ATTEMPTS_RECONCILED='20261113-evidence-verified';
 let claimed=false,calls=0,saved;
 const store={async begin(){if(claimed)throw Error('duplicate');claimed=true;},async finish(r){saved=r;}};
 const h=handler.createHandler({authorizeImpl:async()=>({ok:true,plan:'owner'}),storeFactory:()=>store,
 compare:async()=>{calls++;throw Error('TimeoutError');}});
 const a=response(),b=response();await Promise.all([h(request(),a),h(request(),b)]);
 assert.equal(calls,1);assert.equal(saved.result.tokens,null);assert.equal(b.statusCode,409);
 const c=response();await h(request(),c);assert.equal(c.statusCode,409);assert.equal(calls,1);
 assert(!JSON.stringify(saved).includes('mock-only'));
}));
test('only approved product and server source can be sent',()=>withPreview(async()=>{
 process.env.GEMINI_PRIOR_ATTEMPTS_RECONCILED='20261113-evidence-verified';
 const h=handler.createHandler({authorizeImpl:async()=>({ok:true,plan:'owner'}),storeFactory:()=>{throw Error('must not claim');}});
 for(const body of [{id:'4',confirm:'single-free-tier-call'},{id:'3',confirm:'single-free-tier-call',itemCaption:'tampered'}]){
 const req=request();req.body=body;const res=response();await h(req,res);assert([400,403].includes(res.statusCode));
 }
}));
test('private durable claim survives a new store instance and failed readback',async()=>{
 const {create}=require('../lib/room-writer-raw/gemini-attempt-store');const rows=new Map();let failRead=false;
 const blob={async put(k,v,o){assert.equal(o.allowOverwrite,false);assert.equal(o.access,'private');if(rows.has(k))throw Error('exists');rows.set(k,v);},
 async get(k){if(failRead)throw Error('unavailable');return rows.has(k)?{statusCode:200,stream:new Blob([rows.get(k)]).stream()}:null;}};
 const a=create(blob);failRead=true;await assert.rejects(a.begin({tokens:null}));failRead=false;
 await assert.rejects(create(blob).begin({tokens:null}));assert.equal(rows.size,1);
});
