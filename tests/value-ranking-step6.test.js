'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const safety=require('../public/fact-safety.js');

const rules=JSON.parse(fs.readFileSync(path.join(__dirname,'../public/value-ranking-rules.json'),'utf8'));
safety.setValueRankingRules(rules);

test('type knowledge ranks relevant grounded facts before weaker facts',()=>{
  safety.rememberTypeKnowledge({
    productType:'ワイヤレスイヤホン',usage:'ranking_only',
    readerSituations:['通勤中'],decisionAxes:['使用時間','接続規格']
  });
  const item={
    itemName:'ワイヤレスイヤホン Bluetooth 5.3 最大60時間 10g',
    itemCaption:'',itemPrice:3980
  };
  const ranked=safety.rankCopyFacts(item,['10g','Bluetooth 5.3','最大60時間'],safety.getTypeKnowledge('ワイヤレスイヤホン'));
  assert.equal(ranked.length,3);
  assert.ok(['最大60時間','Bluetooth 5.3'].includes(ranked[0].raw));
  assert.ok(ranked.findIndex(x=>x.raw==='10g')>0);
});

test('ranked post starts from type situation and uses only source-grounded facts',()=>{
  safety.rememberTypeKnowledge({
    productType:'電気ケトル',usage:'ranking_only',
    readerSituations:['朝の支度'],decisionAxes:['容量','温度調整']
  });
  const item={
    itemName:'電気ケトル 1.0L 7段階温度設定',
    itemCaption:'',itemPrice:4980
  };
  const post=safety.buildRankedTypeKnowledgePost(item,'電気ケトル',['7段階温度設定','1.0L','4時間保温']);
  assert.match(post,/^朝の支度で電気ケトルを選ぶなら。/);
  assert.match(post,/1\.0L|7段階温度設定/);
  assert.doesNotMatch(post,/4時間保温/);
  assert.doesNotMatch(post,/安心|必ず|確実/);
});

test('unsafe type knowledge phrases are not remembered',()=>{
  const ok=safety.rememberTypeKnowledge({
    productType:'商品A',usage:'ranking_only',
    readerSituations:['必ず安心して使える場面'],decisionAxes:['最強の性能']
  });
  assert.equal(ok,false);
  assert.equal(safety.getTypeKnowledge('商品A'),null);
});

test('ranking rules live in data file, not product-name branches',()=>{
  const text=fs.readFileSync(path.join(__dirname,'../public/value-ranking-rules.json'),'utf8');
  assert.ok(text.includes('concepts'));
  const safetySource=fs.readFileSync(path.join(__dirname,'../public/fact-safety.js'),'utf8');
  assert.doesNotMatch(safetySource,/ワイヤレスイヤホン|電気ケトル|エアフライヤー|キャリーケース/);
});
