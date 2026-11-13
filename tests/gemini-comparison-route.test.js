'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const handler=require('../api/gemini-comparison-lab');

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
