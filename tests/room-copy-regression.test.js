'use strict';

const fs=require('fs');
const path=require('path');

global.window={};
require(path.join(__dirname,'..','public','fact-safety.js'));
require(path.join(__dirname,'..','public','pain-copy.js'));
require(path.join(__dirname,'..','public','room-copy-quality.js'));

const api=global.window.UrenaviPainCopy;
const safety=global.window.UrenaviFactSafety;
const fixture=JSON.parse(fs.readFileSync(path.join(__dirname,'fixtures','regression-products.json'),'utf8'));
let failures=0;

function fail(id,msg){failures++;console.error('FAIL',id,'-',msg);}
function ok(id,msg){console.log('PASS',id,'-',msg);}

function titleTokens(itemName){
  return api.titleFactTokens({itemName});
}

function validateStrictCopy(id,item,copy){
  const source=titleTokens(item.itemName);
  const tokens=new Set(source);
  const allowed=safety.filterAllowedTitleFacts(source,source);
  if(!allowed.length){
    if(copy!=='') fail(id,'copy must stop when no allowlisted fact exists: '+copy);
    return;
  }
  if(!copy){
    fail(id,'copy stopped despite allowlisted title fact: '+JSON.stringify(allowed));
    return;
  }
  if(!copy.includes('商品名には「')) fail(id,'grounded source statement missing: '+copy);
  if(!copy.includes('確認できる仕様👇')) fail(id,'verified facts heading missing: '+copy);
  if(!copy.includes('※アフィリエイト広告を利用しています')) fail(id,'ROOM disclosure missing');
  if(copy.length>500) fail(id,'copy exceeds 500 chars: '+copy.length);
  if(/こんな人|向いて|おすすめ|悩み|選びどころ|暮らし|使うと|使えば|使うことで/.test(copy)) fail(id,'unsupported audience/use wording leaked: '+copy);
  if(/長持ち|高速|高画質|急速充電|吸水|丈夫|高級|洗い替え/.test(copy)) fail(id,'unsupported benefit claim leaked: '+copy);
  const quoted=[...copy.matchAll(/商品名には「([^」]+)」と明記されています。/g)].map(x=>x[1]);
  if(!quoted.length) fail(id,'no grounded quoted fact found');
  for(const fact of quoted){
    if(!allowed.includes(fact)) fail(id,'quoted benefit fact is outside allowlist: '+fact);
  }
  const facts=copy.split('\n').filter(x=>x.startsWith('✓ ')).map(x=>x.slice(2));
  if(!facts.length) fail(id,'generated copy has no facts');
  for(const fact of facts){
    if(!tokens.has(fact)) fail(id,'fact is not an exact title token: '+fact);
    if(!safety.isAllowedSpecFact(fact)) fail(id,'fact is outside allowlist: '+fact);
  }
}

for(const tc of fixture.cases){
  const item={itemName:tc.itemName,itemPrice:tc.itemPrice||0,catchcopy:'',itemCaption:'',genrePath:'',genreName:''};
  const a=api.analyzeRoomProduct(item,'');
  const e=tc.expect||{};
  const copy=api.makeRoomCopy(item,'',{variant:0});

  if(a.category!==e.category) fail(tc.id,`category expected ${e.category}, got ${a.category}`);
  else ok(tc.id,'category '+a.category);
  if(a.usage!==e.usage) fail(tc.id,`usage expected ${e.usage}, got ${a.usage}`);
  if(Boolean(a.ambiguous)!==Boolean(e.ambiguous)) fail(tc.id,`ambiguous expected ${e.ambiguous}, got ${a.ambiguous}`);
  if(a.outputMode!==e.outputMode) fail(tc.id,`outputMode expected ${e.outputMode}, got ${a.outputMode}`);

  const features=a.facts||[];
  for(const word of e.expectedFeatures||[]) if(!features.includes(word)) fail(tc.id,`missing analyzer feature: ${word}; got ${JSON.stringify(features)}`);
  for(const word of e.forbiddenFeatures||[]) if(features.includes(word)) fail(tc.id,`forbidden analyzer feature: ${word}`);

  validateStrictCopy(tc.id,item,copy);
  if(api.makeThreadsCopy(item,'',{variant:0})!==copy) fail(tc.id,'Threads route differs from strict ROOM route');
  if(api.makeInstagramCopy(item,'',{variant:0})!==copy) fail(tc.id,'Instagram route differs from strict ROOM route');

  console.log('RESULT',JSON.stringify({
    id:tc.id,category:a.category,usage:a.usage,ambiguous:a.ambiguous,outputMode:a.outputMode,
    allowlisted:safety.filterAllowedTitleFacts(titleTokens(item.itemName),titleTokens(item.itemName)),copy
  }));
}

// Promotion/claim cleanup and classification remain independently guarded.
{
  const cleaned=api.stripPromotionalText('【搬入設置無料】掃除用具入れ ロッカー');
  if(cleaned!=='掃除用具入れ ロッカー') fail('spacing','promo cleanup failed: '+cleaned);
}
for(const id of ['live-battery-rank5-anker-zolo']){
  const tc=fixture.cases.find(x=>x.id===id);
  const a=api.analyzeRoomProduct({itemName:tc.itemName,itemPrice:tc.itemPrice||0},'');
  if(a.category!=='charging'||a.usage!=='mobile_battery'||a.outputMode!=='full') fail(id,'Power Bank synonym classification regressed');
}
for(const id of ['counter-power-bank-case','counter-powerbank-pouch']){
  const tc=fixture.cases.find(x=>x.id===id);
  const a=api.analyzeRoomProduct({itemName:tc.itemName,itemPrice:tc.itemPrice||0},'');
  if(a.category!=='accessory'||a.usage!=='mobile_battery_case') fail(id,'Power Bank accessory priority regressed');
}
{
  const tc=fixture.cases.find(x=>x.id==='pet-hygiene-wipe-conflict');
  const a=api.analyzeRoomProduct({itemName:tc.itemName,itemPrice:0},'');
  if(!a.ambiguous||a.ambiguityReason!=='pet_toilet_hygiene_conflict') fail(tc.id,'pet toilet/hygiene conflict not detected');
}
{
  const tc=fixture.cases.find(x=>x.id==='special-battery-electric-blanket');
  const a=api.analyzeRoomProduct({itemName:tc.itemName,itemPrice:tc.itemPrice||0},'');
  if(a.outputMode!=='fallback') fail(tc.id,'special-use battery must remain fallback');
  if(!(a.conflicts||[]).some(x=>x.usage==='special_battery'&&x.phrase==='電気毛布')) fail(tc.id,'special battery conflict missing');
}

// Strict output examples: generate only explicit allowlisted specifications.
const strictCases=[
  {id:'strict-battery',itemName:'モバイルバッテリー 10000mAh USB-C対応 人気 ギフト',itemPrice:2980,want:['USB-C対応'],drop:['10000mAh','人気','ギフト']},
  {id:'strict-material',itemName:'財布 本革 メンズ ブランド名',itemPrice:5000,want:['本革'],drop:['メンズ','ブランド名']},
  {id:'strict-count',itemName:'タオル 10枚入り 送料無料',itemPrice:1200,want:['10枚入り'],drop:['送料無料']},
  {id:'strict-stop',itemName:'ケース 防水 ワンタッチ 人気',itemPrice:1000,want:[],drop:['ケース','防水','ワンタッチ','人気']}
];
for(const tc of strictCases){
  const item={itemName:tc.itemName,itemPrice:tc.itemPrice};
  const copy=api.makeRoomCopy(item,'');
  if(tc.want.length===0){
    if(copy!=='') fail(tc.id,'must stop without allowlisted facts: '+copy);
    continue;
  }
  validateStrictCopy(tc.id,item,copy);
  for(const x of tc.want) if(!copy.includes('✓ '+x)) fail(tc.id,'missing allowed fact '+x+': '+copy);
  for(const x of tc.drop) if(copy.includes('✓ '+x)) fail(tc.id,'unsafe/non-spec fact leaked '+x+': '+copy);
}

if(failures){
  console.error('ROOM copy regression failures:',failures);
  process.exit(1);
}
console.log('ROOM copy regression passed');
