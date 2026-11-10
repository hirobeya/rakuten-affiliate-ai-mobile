'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {build,restore}=require('../../lib/urenavi-core/editorial-source-ledger');
const bundle=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../docs/evaluations/20261027-fixed/inputs.json'),'utf8'));
const products=bundle.entries.filter(e=>/room-products|room-unseen|live-local-analysis/.test(e.name)).flatMap(e=>(Array.isArray(e.data)?e.data:e.data.items).map(x=>x.item));
test('all 44 frozen products retain source coverage of long passages without model calls',()=>{
 assert.equal(products.length,44);
 let longProducts=0;
 for(const item of products){
  const ledger=build(item);let hasLong=false;
  for(const field of ['itemName','itemCaption','catchcopy']){
   const source=String(item[field]||'');
   const boundary=ledger.excluded.filter(x=>x.field===field).reduce((n,x)=>Math.min(n,x.start),source.length);
   const found=[...source.slice(0,boundary).matchAll(/[^●※。\n\r]+[。]?/g)];
   const valid=found.filter(m=>m[0].trim().length>=2);
   for(const m of valid){
    const lead=m[0].search(/\S/),start=m.index+lead,end=m.index+m[0].trimEnd().length;
    if(end-start>260)hasLong=true;
    for(let pos=start;pos<end;pos++)assert.ok(ledger.passages.some(p=>p.field===field&&p.start<=pos&&pos<p.end),item.itemCode+' evidence omitted at '+field+':'+pos);
   }
  }
  if(hasLong)longProducts++;
  for(const p of ledger.passages){
   assert.ok(p.text.length<=260);
   assert.equal(String(item[p.field]||'').slice(p.start,p.end),p.text);
   assert.ok(!ledger.excluded.some(x=>x.field===p.field&&p.end>x.start));
  }
 }
 assert.ok(longProducts>=16,'previously dropped long passages are covered');
});
test('negative condition within a long original remains in exact source snippets',()=>{
 const source='型番によって適用条件が異なります。'+('収納方法についての説明、').repeat(30)+'別売りのカバーには対応していません。';
 const item={itemName:'収納ボックス',itemCaption:source};
 const l=build(item),negative=l.passages.find(p=>p.text.includes('対応していません'));
 assert.ok(negative);assert.ok(negative.text.includes('別売りのカバーには対応していません'));
 const id=l.passages.find(p=>p.field==='itemName').id;
 const draft={product:{what:'収納ボックス',acts_on:'収納',sourceId:id},sentences:[{text:'収納ボックスの別売りのカバーは非対応です。',sourceIds:[negative.id],kinds:['spec']}]};
 const restored=restore(draft,item);
 assert.equal(restored.sentences[0].quotes[0],negative.text);
});

test('compact model references save duplicate text while exact server citations remain unchanged',()=>{
 const {forModel}=require('../../lib/urenavi-core/editorial-source-ledger');
 const provider=require('../../lib/room-semantic-provider');
 for(const item of products){
  const full=build(item),compact=forModel(full);
  assert.equal(compact.passages.length,full.passages.length);
  for(let i=0;i<full.passages.length;i++){
   const p=compact.passages[i],o=full.passages[i];
   assert.equal(p.id,o.id);assert.equal(p.start,o.start);assert.equal(p.end,o.end);
   assert.ok(p.preview.length<=49);
   assert.equal(Object.hasOwn(p,'text'),false,'full evidence is not repeated in model ledger');
   assert.equal(p.partial,o.role==='unverified_partial_passage');
  }
  const r=provider.stageRequest('generate',item,{},provider.REVIEW_PROMPT,'editorial');
  assert.equal(r.userPayload.itemCaption,item.itemCaption,'the full source is sent unchanged');
  assert.equal(r.userPayload.itemName,item.itemName);
  assert.deepEqual(r.schema.properties.sentences.items.properties.sourceIds.items.enum,full.passages.map(p=>p.id));
 }
});
