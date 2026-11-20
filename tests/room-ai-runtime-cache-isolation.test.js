'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createRuntimeCacheStore}=require('../lib/super-urenavi-cache');
const item={itemCode:'fixture:1',itemName:'収納ケース',itemCaption:'幅20cm'};
test('preview product cache never touches billing/production DB',async()=>{
 let calls=0;
 const store=createRuntimeCacheStore(async()=>{calls++;return [];},{env:{VERCEL_ENV:'preview'}});
 await assert.rejects(store.loadProduct(item),/isolated_cache_not_authorized/);
 await assert.rejects(store.saveProduct({...item,model:'local',rawAiJson:{}}),/isolated_cache_not_authorized/);
 await assert.rejects(store.loadTypeKnowledge('収納ケース'),/isolated_cache_not_authorized/);
 assert.equal(calls,0);
});
test('production product cache retains existing database contract',async()=>{
 const paths=[];
 const store=createRuntimeCacheStore(async(path)=>{paths.push(path);return [];},
  {env:{VERCEL_ENV:'production'}});
 assert.equal(await store.loadProduct(item),null);
 assert.equal(paths.length,1);
 assert.match(paths[0],/^urenavi_product_understanding_cache\?/);
});

test('preview cache routes both product and type knowledge through isolated DB only',async()=>{
 let prodCalls=0;const isolated=[];
 const previewDb=async(path,options)=>{
  isolated.push({path,method:options?.method||'GET'});
  if(options?.method==='POST')return null;
  return [];
 };
 const store=createRuntimeCacheStore(async()=>{prodCalls++;throw Error('production DB must never receive preview request');},{
  env:{VERCEL_ENV:'preview'},previewDb
 });
 assert.equal(await store.loadProduct(item),null);
 await store.saveProduct({...item,model:'local',rawAiJson:{productType:{value:'収納ケース'}}});
 assert.equal(await store.loadTypeKnowledge('収納ケース'),null);
 await store.saveTypeKnowledge({productType:'収納ケース',model:'local',rawAiJson:{}});
 assert.equal(prodCalls,0);
 assert.deepEqual(isolated.map(x=>x.method),['GET','POST','GET','POST']);
 assert.ok(isolated.every(x=>/^(urenavi_product_understanding_cache|urenavi_product_type_knowledge_cache)/.test(x.path)));
});
