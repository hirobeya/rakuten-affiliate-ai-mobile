'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const {corpusGenres}=require('../lib/evaluation-corpus');
test('evidence-rich saved products are really evaluated instead of silently counting zero',()=>{
  const rows=require('./fixtures/room-products.json');
  const genres=corpusGenres(rows);
  assert.equal(genres.reduce((n,g)=>n+g.items.length,0),rows.length);
  const result=JSON.parse(execFileSync(process.execPath,['scripts/audit-grounded-copy.js','--corpus=tests/fixtures/room-products.json'],{encoding:'utf8'}));
  assert.equal(result.totals.total,rows.length);
  assert.equal(result.totals.hasCaption,rows.filter(x=>x.item.itemCaption).length);
  assert.ok(result.totals.hasCaption>0);
});
test('existing genre corpus is preserved, unsupported inputs fail clearly',()=>{
  const corpus={genres:[{items:[{itemName:'タオル'}]}]};assert.equal(corpusGenres(corpus),corpus.genres);
  assert.throws(()=>corpusGenres({products:[]}),/Unsupported/);
  assert.throws(()=>corpusGenres([{item:{}}]),/Invalid/);
});
