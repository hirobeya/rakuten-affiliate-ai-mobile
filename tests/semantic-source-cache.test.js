'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createCacheStore,productCacheKey,productSourceHash}=require('../lib/super-urenavi-cache');
const {advance}=require('../lib/room-semantic-engine');
const {questions}=require('../lib/room-semantic-contract');

function setup(){
  const rows=new Map();
  const store=createCacheStore(async(path,options)=>{
    if(options?.method==='POST'){
      const row=JSON.parse(options.body);rows.set(row.cache_key,row);return null;
    }
    const key=new URLSearchParams(path.split('?')[1]).get('cache_key')?.slice(3);
    return rows.has(key)?[rows.get(key)]:[];
  });
  return {store,rows};
}

test('all three source fields bind persisted product state; equivalent whitespace reuses it',async()=>{
  const {store}=setup();
  const item={itemCode:'source:cache',itemName:'収納ボックス',itemCaption:'収納用',catchcopy:'折りたたみ可能'};
  await store.saveProduct({...item,rawAiJson:{checked:true}});
  assert.equal((await store.loadProduct(item)).raw_ai_json.checked,true);
  for(const changed of [{catchcopy:'折りたたみ不可'},{catchcopy:''},{itemName:'カバー'},{itemCaption:'別売り'}]){
    assert.equal(await store.loadProduct({...item,...changed}),null,JSON.stringify(changed));
  }
  assert.ok(await store.loadProduct({...item,catchcopy:' 折りたたみ可能　'}));
  const legacy={itemCode:'legacy:cache',itemName:'タオル',itemCaption:'綿100%'};
  await store.saveProduct({...legacy,rawAiJson:{legacy:true}});
  assert.ok(await store.loadProduct({...legacy,catchcopy:''}));
  assert.equal(await store.loadProduct({...legacy,catchcopy:'10枚入り'}),null);
  assert.equal(productCacheKey('a','b','c'),productCacheKey('a','b','c',''));
  assert.notEqual(productSourceHash('a','b','c'),productSourceHash('a','c','b'));
});

test('semantic done result cannot bypass generation after catchcopy changes or is removed',async()=>{
  const {store}=setup();let calls=0;
  const item={itemCode:'semantic:source',itemName:'収納ボックス',itemCaption:'',catchcopy:'使わないときは折りたたみ可能な収納ボックス'};
  const draft={product:{what:'収納ボックス',acts_on:'収納する物',acts_on_quote:item.catchcopy},sentences:[{text:'使わないときに折りたたみたいなら、この収納ボックス。',kinds:['benefit','scene'],quotes:[item.catchcopy]}]};
  const provider={model:'test-source-cache',requiredTokens:()=>0,call:async stage=>{
    calls++;
    return {raw:stage==='generate'?draft:{product:{what:'supported',acts_on:'supported'},sentences:draft.sentences.map(s=>({text:s.text,...Object.fromEntries(questions.map(q=>[q,'supported'])),evidenceQuotes:[]})),quality:Object.fromEntries(['identity','reason','scene','natural','non_redundant','room_style'].map(q=>[q,'supported']))},rateLimit:{}};
  }};
  const args={item,store,provider};
  assert.equal((await advance(args)).pending,true);
  assert.equal((await advance(args)).ok,true);
  assert.equal(calls,2);
  assert.equal((await advance(args)).ok,true);
  assert.equal(calls,2,'same original sources reuse verified state without new calls');
  for(const catchcopy of ['折りたたみ不可の収納ボックス','']){
    const changed={...args,item:{...item,catchcopy}};
    const peek=await advance({...changed,readOnly:true});
    assert.equal(peek.ok,false);assert.equal(peek.quality.text,'');
    const before=calls;
    const out=await advance(changed);
    assert.equal(calls,before+1,'changed source restarts generation');
    assert.equal(out.ok,false);assert.equal(out.quality.text,'');
  }
});
