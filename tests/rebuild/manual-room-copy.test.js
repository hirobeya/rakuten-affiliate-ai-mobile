'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const manual=require('../../lib/manual-room-copy');
const {verifyNaturalization}=require('../../lib/room-copy-naturalization');

function run(handler,body,query){
 const res={setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;return this;}};
 return Promise.resolve(handler({method:'POST',body,query,headers:{}},res)).then(()=>res);
}

test('manual-only route accepts a paid session and uses only submitted product data',async()=>{
 process.env.VERCEL_ENV='production';
 process.env.URENAVI_PRODUCT_INPUT_MODE='manual';
 const handler=manual.createHandler({authorizeUser:async()=>({ok:true,plan:'base'})});
 const response=await run(handler,{name:'電気ケトル',features:'電気ケトルは、細い注ぎ口により、湯の量や速度のコントロールを初心者でも調整できます。',description:'',price:3980,itemCode:'ignore',itemUrl:'https://ignored.invalid'});
 assert.equal(response.code,200,JSON.stringify(response.data));
 assert.match(response.data.text,/湯の量や速度を初心者でも調整できます/);
 assert.match(response.data.text,/3,980円/);
 assert.doesNotMatch(response.data.text,/ignore|https:/);
 console.log('MANUAL_ROOM_COPY',JSON.stringify(response.data.text));
 assert.equal((await run(handler,{name:'収納ベンチ',features:'',description:'',price:null})).code,400);
 const free=manual.createHandler({authorizeUser:async()=>({ok:true,plan:'free'})});
 assert.equal((await run(free,{})).code,403);
 for(const file of ['search','search-v2','pro','pro-genres','pro-cron','room-ai','room-ai-v3']){
   assert.equal((await run(require('../../api/'+file),{},{urenaviContract:'1'})).code,403,file);
 }
});

test('naturalization preserves quantity, conditions, degree, negation and numbers',()=>{
 const original='電気ケトルは、湯の量や速度のコントロールを初心者でも調整できます。価格：1,200円';
 const clean='電気ケトルは、湯の量や速度を初心者でも調整できます。価格：1,200円';
 assert.equal(verifyNaturalization(original,clean),true);
 for(const candidate of [
  clean.replace('量や速度','温度'),clean.replace('初心者でも','すべての人が'),
  clean.replace('初心者でも',''),clean.replace('できます','できません'),
  clean.replace('調整できます','細かく調整できます'),clean.replace('1,200','2,100')
 ])assert.equal(verifyNaturalization(original,candidate),false,candidate);
});
