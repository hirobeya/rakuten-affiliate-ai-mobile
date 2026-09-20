'use strict';

const fs=require('fs');
const path=require('path');

global.window={};
require(path.join(__dirname,'..','public','pain-copy.js'));
require(path.join(__dirname,'..','public','room-copy-quality.js'));

const api=global.window.UrenaviPainCopy;
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','regression-products.json'),'utf8'));
let failures=0;

function fail(id,msg){
  failures++;
  console.error('FAIL',id,'-',msg);
}
function ok(id,msg){
  console.log('PASS',id,'-',msg);
}

for(const tc of fixture.cases){
  const item={itemName:tc.itemName,itemPrice:tc.itemPrice||0,catchcopy:'',itemCaption:'',genrePath:'',genreName:''};
  const a=api.analyzeRoomProduct(item,'');
  const copy=api.makeRoomCopy(item,'',{variant:0});
  const features=a.facts||[];
  const e=tc.expect||{};

  if(a.category!==e.category) fail(tc.id,`category expected ${e.category}, got ${a.category}`);
  else ok(tc.id,'category '+a.category);

  if(a.usage!==e.usage) fail(tc.id,`usage expected ${e.usage}, got ${a.usage}`);
  if(Boolean(a.ambiguous)!==Boolean(e.ambiguous)) fail(tc.id,`ambiguous expected ${e.ambiguous}, got ${a.ambiguous}`);
  if(a.outputMode!==e.outputMode) fail(tc.id,`outputMode expected ${e.outputMode}, got ${a.outputMode}`);

  for(const word of e.forbiddenWords||[]){
    if(copy.includes(word)) fail(tc.id,`forbidden word in copy: ${word}`);
  }
  for(const word of e.expectedFeatures||[]){
    if(!features.includes(word)) fail(tc.id,`missing feature: ${word}; got ${JSON.stringify(features)}`);
  }
  for(const word of e.forbiddenFeatures||[]){
    if(features.includes(word)) fail(tc.id,`forbidden feature: ${word}`);
  }
  if(copy.length>500) fail(tc.id,`copy exceeds 500 chars: ${copy.length}`);
  if(!copy.includes('※アフィリエイト広告を利用しています')) fail(tc.id,'ROOM disclosure missing');

  console.log('RESULT',JSON.stringify({
    id:tc.id,
    itemName:tc.itemName,
    category:a.category,
    usage:a.usage,
    ambiguous:a.ambiguous,
    outputMode:a.outputMode,
    reason:a.ambiguityReason,
    features,
    conflicts:a.conflicts,
    copy
  }));
}

// Explicit quantity regression cases.
const quantityCases=[
  {name:'掃除クロス 10枚入り',must:'10枚入り',mustNot:'10枚セット'},
  {name:'掃除クロス 6枚セット',must:'6枚セット'},
  {name:'掃除クロス 54枚',mustNot:'54枚セット'},
  {name:'モバイルバッテリー 4本ケーブル内蔵',mustNot:'4本セット'},
  {name:'取替式 網戸 掃除グッズ〖10〗',mustNot:'10枚セット'}
];
for(const [idx,q] of quantityCases.entries()){
  const item={itemName:q.name,itemPrice:1000};
  const a=api.analyzeRoomProduct(item,'');
  const f=a.facts||[];
  if(q.must && !f.includes(q.must)) fail('quantity-'+idx,`missing ${q.must}: ${JSON.stringify(f)}`);
  if(q.mustNot && f.includes(q.mustNot)) fail('quantity-'+idx,`unexpected ${q.mustNot}: ${JSON.stringify(f)}`);
}

// Smoke-check non-ROOM surfaces do not throw after classification engine change.
for(const tc of fixture.cases.slice(0,11)){
  const item={itemName:tc.itemName,itemPrice:tc.itemPrice||0};
  try{
    api.makeThreadsCopy(item,'',{variant:0});
    api.makeInstagramCopy(item,'',{variant:0});
  }catch(err){
    fail(tc.id,'SNS smoke error: '+err.message);
  }
}

if(failures){
  console.error(`ROOM copy regression failures: ${failures}`);
  process.exit(1);
}
console.log(`ROOM copy regression passed: ${fixture.cases.length} fixed cases + ${quantityCases.length} quantity cases`);
