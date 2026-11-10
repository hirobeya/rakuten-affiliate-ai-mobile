'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {fitsLength}=require('../../public/room-copy-result');
const corpus=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../docs/evaluations/20261027-fixed/inputs.json'),'utf8'));
const reference=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../docs/evaluations/20261110-human-reference-copy.json'),'utf8'));
const items=corpus.entries.filter(e=>/room-products|room-unseen|live-local-analysis/.test(e.name)).flatMap(e=>(Array.isArray(e.data)?e.data:e.data.items).map(x=>x.item));
test('recorded Groq failures have complete human source-bound comparators, never runtime exceptions',()=>{
 assert.equal(reference.examples.length,2);
 assert.equal(reference.scope.includes('Not auto-approved'),true);
 for(const ex of reference.examples){
  const item=items.find(x=>x.itemCode===ex.itemCode);
  assert.ok(item,'must be a real unchanged frozen product');
  assert.equal(ex.kind,'reference_not_model_output');
  assert.ok(fitsLength(ex.post),'complete post must fit ROOM ceiling including disclosure');
  assert.ok(ex.post.includes('※アフィリエイト広告を利用しています'));
  assert.ok(ex.post.includes('なら'),'must connect product to reader choice');
  const source=[item.itemName,item.itemCaption,item.catchcopy||''].join('\n');
  assert.ok(ex.evidence.length>=4);
  for(const evidence of ex.evidence){
   assert.ok(source.includes(evidence.quote),ex.itemCode+': source evidence not verbatim '+evidence.quote);
  }
  for(const forbidden of ex.excludedUnproved)assert.equal(ex.post.includes(forbidden),false,'excluded invented claim appeared: '+forbidden);
 }
});
test('SEO keyword section cannot supply missing independent source evidence',()=>{
 const bag=reference.examples.find(x=>x.itemCode==='bos-shop:10000023');
 assert.ok(bag);
 assert.ok(!/レジ|生ゴミ|おむつ/.test(bag.post),'source keyword-only scenarios not presented as verified facts');
});
