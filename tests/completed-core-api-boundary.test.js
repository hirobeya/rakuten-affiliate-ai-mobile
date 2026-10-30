'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createHandler}=require('../lib/room-copy-handler');
function res(){return {setHeader(){},status(n){this.code=n;return this;},json(v){this.body=v;return v;}};}
for(const kind of ['unconfigured','miss','invalid','unauthorized'])test('completed-only API '+kind+' never invokes provider or quota',async()=>{
 const old=process.env.VERCEL_ENV;process.env.VERCEL_ENV='preview';let calls=0,loads=0;
 try{const deps={authorize:async()=>({ok:kind!=='unauthorized',plan:'owner',user:{id:'owner'}}),provider:{call(){calls++;throw Error('forbidden');}},consumeQuota:async()=>{calls++;throw Error('forbidden');},logCost(){}};
 if(kind!=='unconfigured')deps.loadCompletedCore=async()=>{loads++;return kind==='invalid'?{owner:'other',artifact:{}}:null;};
 const r=res();await createHandler(deps)({method:'POST',body:{completedCoreOnly:true,itemCode:'fixture:a',itemName:'収納箱',itemCaption:'収納箱',catchcopy:''}},r);
 assert.equal(r.code,{unconfigured:503,miss:404,invalid:409,unauthorized:403}[kind]);assert.equal(calls,0);if(kind==='unauthorized')assert.equal(loads,0);assert.notEqual(r.body.ok,true);assert.equal(r.body.variants,undefined);
 }finally{if(old===undefined)delete process.env.VERCEL_ENV;else process.env.VERCEL_ENV=old;}
});
