'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const structured=require('../public/structured-room-copy');
const contract=require('../lib/room-semantic-contract');
const provider=require('../lib/room-semantic-provider');

test('catchcopy is accepted only as actual product-source evidence',()=>{
 const item={itemName:'タオル',itemCaption:'',catchcopy:'綿100% 10枚入り'};
 assert.ok(structured.extractFacts(item).some(x=>x.quote==='綿100%'&&x.source==='catchcopy'));
 assert.equal(contract.bind(item,'綿100%')?.source,'catchcopy');
 assert.equal(contract.bind({...item,catchcopy:''},'綿100%'),null);
});

test('semantic writer and reviewer receive identical catchcopy',()=>{
 const item={itemName:'タオル',itemCaption:'',catchcopy:'綿100% 10枚入り'};
 assert.equal(provider.payload('generate',item).catchcopy,item.catchcopy);
 assert.equal(provider.payload('verify',item,{draft:{sentences:[]}}).catchcopy,item.catchcopy);
});

test('catchcopy cannot authorize facts absent from any source',()=>{
 const item={itemName:'タオル',itemCaption:'',catchcopy:'綿100%'};
 assert.equal(contract.bind(item,'防水'),null);
 assert.ok(!structured.extractFacts(item).some(x=>x.quote==='防水'));
});

// Matching a positive substring inside a negated claim is not positive evidence.
test('semantic inspection blocks quotes cut before trailing negation',()=>{
 for(const itemCaption of ['防水不可','防水なし','防水できません','防水対象外']){
  const item={itemName:'バイクグローブ',itemCaption};
  const draft={product:{what:'バイクグローブ',acts_on:'手',acts_on_quote:'バイクグローブ'},sentences:[{text:'防水のバイクグローブを選びたいときに。',kinds:['benefit'],quotes:['防水']}]};
  assert.ok(contract.inspect(item,draft).failures.some(x=>x.rule==='quote_cuts_negation'),itemCaption);
 }
});
