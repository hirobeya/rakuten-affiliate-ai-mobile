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
