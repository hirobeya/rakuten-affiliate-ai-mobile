'use strict';

const assert=require('node:assert/strict');
const {
  normalizeText,normalizeProductType,productSourceHash,productCacheKey,
  normalizeImageUrl,imageCacheKey,productTypeKnowledgeKey,expiresAt,isUsableRow,createCacheStore,
  UNKNOWN_TTL_MS,PRODUCT_TTL_MS
}=require('../lib/super-urenavi-cache');

function run(name,fn){
  return Promise.resolve().then(fn).then(()=>console.log('PASS',name),e=>{console.error('FAIL',name,e);process.exitCode=1;});
}

(async()=>{
  await run('product cache key is itemCode plus normalized title/caption hash',()=>{
    const a=productCacheKey('shop:1',' 電気ケトル　1.0L ','7段階\n温度調節');
    const b=productCacheKey('shop:1','電気ケトル 1.0L','7段階 温度調節');
    const c=productCacheKey('shop:2','電気ケトル 1.0L','7段階 温度調節');
    assert.equal(a,b);
    assert.notEqual(a,c);
    assert.equal(productSourceHash(' A ','B\nC'),productSourceHash('A','B C'));
  });

  await run('cache key has no prompt or validation version component',()=>{
    const key=productCacheKey('shop:1','商品名','説明');
    assert.equal(key.length,64);
    assert.equal(key,productCacheKey('shop:1','商品名','説明'));
  });

  await run('image cache removes presentation size parameters but preserves identity parameters',()=>{
    const a='https://example.com/item.jpg?_ex=128x128&token=abc&w=100';
    const b='https://example.com/item.jpg?token=abc&_ex=600x600&h=600';
    assert.equal(normalizeImageUrl(a),'https://example.com/item.jpg?token=abc');
    assert.equal(normalizeImageUrl(a),normalizeImageUrl(b));
    assert.equal(imageCacheKey(a),imageCacheKey(b));
    assert.notEqual(imageCacheKey(a),imageCacheKey('https://example.com/item.jpg?token=def'));
  });

  await run('product type key is normalized and reusable across equivalent spellings',()=>{
    assert.equal(normalizeProductType(' 完全ワイヤレスイヤホン　'),'完全ワイヤレスイヤホン');
    assert.equal(productTypeKnowledgeKey('USB HUB'),productTypeKnowledgeKey('ｕｓｂ　ｈｕｂ'));
  });

  await run('unknown result has a short TTL while successful product understanding is long lived',()=>{
    const now=Date.now();
    const unknown=Date.parse(expiresAt('unknown','product',now))-now;
    const ok=Date.parse(expiresAt('ok','product',now))-now;
    assert.equal(unknown,UNKNOWN_TTL_MS);
    assert.equal(ok,PRODUCT_TTL_MS);
    assert.ok(ok>unknown);
  });

  await run('expired cache rows are rejected at read time',()=>{
    assert.equal(isUsableRow({expires_at:new Date(Date.now()-1000).toISOString()}),false);
    assert.equal(isUsableRow({expires_at:new Date(Date.now()+1000).toISOString()}),true);
  });

  await run('store separates product, image and type knowledge tables',async()=>{
    const calls=[];
    const db=async(path,options)=>{
      calls.push({path,options});
      if(!options) return [];
      return null;
    };
    const store=createCacheStore(db);
    await store.saveProduct({itemCode:'shop:1',itemName:'電気ケトル',itemCaption:'1.0L',model:'m',promptVersion:'p',rawAiJson:{x:1}});
    await store.saveImage({imageUrl:'https://example.com/x.jpg?_ex=128x128',model:'m',promptVersion:'p',rawAiJson:{x:2}});
    await store.saveTypeKnowledge({productType:'電気ケトル',model:'m',promptVersion:'p',rawAiJson:{situations:['朝']},validationStatus:'valid'});
    assert.equal(calls[0].path,'urenavi_product_understanding_cache');
    assert.equal(calls[1].path,'urenavi_image_understanding_cache');
    assert.equal(calls[2].path,'urenavi_product_type_knowledge_cache');
    const productBody=JSON.parse(calls[0].options.body);
    assert.equal(productBody.prompt_version,'p');
    assert.ok(productBody.cache_key);
    assert.ok(productBody.source_hash);
    assert.equal(productBody.validation_rule_version,undefined);
  });

  if(process.exitCode) process.exit(process.exitCode);
})();
