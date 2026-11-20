'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createRuntimeCacheStore}=require('../lib/super-urenavi-cache');
const item={itemCode:'fixture:1',itemName:'収納ケース',itemCaption:'幅20cm'};
test('preview product cache never touches billing/production DB',async()=>{
 let calls=0;
 const store=createRuntimeCacheStore(async()=>{calls++;return [];},{env:{VERCEL_ENV:'preview'}});
 await assert.rejects(store.loadProduct(item),/isolated_preview_cache_unavailable/);
 await assert.rejects(store.saveProduct({...item,model:'local',rawAiJson:{}}),/isolated_preview_cache_unavailable/);
 await assert.rejects(store.loadTypeKnowledge('収納ケース'),/isolated_preview_cache_unavailable/);
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
