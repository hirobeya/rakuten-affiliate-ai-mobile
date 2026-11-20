'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {extractEvidence,verifyEvidence}=require('../lib/urenavi-core/source-evidence-ledger');
const {localZeroCall}=require('../api/room-ai-v3');
const corpus=require('../docs/rebuild-20261028/p3-local-first-20261108/evaluation.json');
test('44 products: factual ledger retains original spans with no publication grant',()=>{
 let withCandidates=0,withRelation=0,total=0,missing=0,unresolved=0;
 const stages={},matrix={};
 for(const {item} of corpus.rows){
  const diag={},copy=localZeroCall(item,'',diag,{editorial:true,linkedReason:true,identityExpansion:true,verifiedIntent:true});
  const id=diag.identity||diag.identityCandidates?.literal||diag.identityCandidates?.rule||'';
  const result=extractEvidence({...item,identity:id});
  assert.ok(verifyEvidence(item,result),item.itemCode);
  assert.equal(result.facts.some(f=>f.publicationApproved!==false),false);
  total+=result.facts.length;
  if(result.facts.length)withCandidates++;
  if(result.facts.some(f=>f.claimType==='source_purchase_relation'))withRelation++;
  if(!item.itemCaption)missing++;
  if(!id)unresolved++;
  const stage=diag.stage||'unknown';stages[stage]=(stages[stage]||0)+1;
  const signal=result.facts.some(f=>f.claimType==='source_purchase_relation')?'direct_relation':result.facts.length?'feature_only':'no_evidence';
  const group=stage+'|'+signal;matrix[group]=(matrix[group]||0)+1;
  if(result.facts.length)console.log('SOURCE_LEDGER_PRODUCT',JSON.stringify({
    code:item.itemCode,stage,reason:diag.reason,identity:id,
    sourceRelations:result.facts.filter(f=>f.claimType==='source_purchase_relation').length,
    quotes:result.facts.slice(0,3).map(x=>x.quote)
  }));
 }
 assert.equal(corpus.rows.length,44);
 console.log('SOURCE_LEDGER_SUMMARY',JSON.stringify({products:44,withCandidates,withRelation,total,missing,unresolved,stages,matrix}));
});
test('direct product-linked complete source claims are preserved exactly',()=>{
 const item={itemName:'洗濯ネット 6枚セット',itemCaption:'商品説明 この洗濯ネットは角型で使えます。洗濯ネットのセット内容は自由に組み合わせることができるので、用途に合わせてカスタマイズ可能です。'};
 const ledger=extractEvidence({...item,identity:'洗濯ネット'});
 assert.ok(verifyEvidence(item,ledger));
 assert.ok(ledger.facts.some(x=>x.claimType==='source_purchase_relation'&&x.quote.includes('用途に合わせて')));
});
test('reject adjacent unrelated, negated, promotional and unsupported claims',()=>{
 const name='洗濯ネット';
 const captions=[
  '関連商品はこちら。別売りの洗濯ネットは組み合わせて使えます。',
  'この洗濯ネットは組み合わせて使えません。',
  'この洗濯ネットは必ず安全に使用できます。',
  '送料無料の洗濯ネットを買うと必ず得します。',
  'この収納ケースは取り出しやすくできます。'
 ];
 for(const caption of captions){
  const ledger=extractEvidence({itemName:'洗濯ネット 6枚',itemCaption:caption,identity:name});
  assert.equal(ledger.facts.length,0,caption);
 }
});
test('source spans cannot be forged or drift after item edits',()=>{
 const item={itemName:'収納ボックス 収納ケース',itemCaption:'この収納ボックスは引き出しに衣類を分けて収納できます。'};
 const ledger=extractEvidence({...item,identity:'収納ボックス'});
 assert.ok(ledger.facts.length>0);
 assert.ok(verifyEvidence(item,ledger));
 assert.equal(verifyEvidence({...item,itemCaption:'別の商品です。'},ledger),false);
 ledger.facts[0].publicationApproved=true;
 assert.equal(verifyEvidence(item,ledger),false);
});

test('adjacent evidence requires a title-bound subject and retains both source positions',()=>{
 const opening='細口ポットは、注ぐときの湯量と速度を調整できます。';
 const reason='細い注ぎ口により、湯量や速度を細かく調整できます。';
 const item={itemName:'電気ポット 細口ポット 0.9L',itemCaption:opening+reason};
 const extract=item=>extractEvidence({...item,identity:'電気ポット'});
 const ledger=extract(item);
 const fact=ledger.facts.find(x=>x.quote===reason);
 assert.equal(fact?.subjectBinding,'adjacent_explicit_subject');
 assert.deepEqual(fact.subjectSpan,{start:0,end:opening.length});
 assert.ok(verifyEvidence(item,ledger));
 assert.equal(verifyEvidence(item,{facts:[{...fact,subjectSpan:{start:1,end:opening.length}}]}),false);
 for(const boundary of ['\n','■','【別モデル】','こちらもおすすめ。','別売り品について。']){
  assert.equal(extract({...item,itemCaption:opening+boundary+reason}).facts.some(x=>x.quote===reason),false,boundary);
 }
 assert.equal(extract({...item,itemCaption:'【別モデル】'+opening+reason}).facts.some(x=>x.quote===reason),false);
 for(const switched of ['別売りのノズルにより、湯量や速度を調整できます。','旧モデルは細い注ぎ口により、湯量や速度を調整できます。']){
  assert.equal(extract({...item,itemCaption:opening+switched}).facts.some(x=>x.quote===switched),false,switched);
 }
});

test('a source-bound follow-up supplies the product and passes existing mobile publication checks',()=>{
 const {verifiedCaptionEditorialRescue}=require('../api/room-ai-v3');
 const {provenLocalCopy}=require('../lib/room-copy-handler');
 const item=corpus.rows.find(({item})=>item.itemCode==='mpowjapan:10000907').item;
 const result=localZeroCall(item,'',{}, {editorial:true,linkedReason:true,identityExpansion:true,verifiedIntent:true});
 assert.match(result.quality.text,/^電気ケトルは、精密な注ぎ口/);
 assert.ok(item.itemCaption.includes(result.local.partner.quote));
 assert.ok(verifiedCaptionEditorialRescue(item,result));
 assert.ok(provenLocalCopy(item,result));
});

test('flattened merchant tables cannot pass as a ROOM paragraph',()=>{
 const {catalogueOnly}=require('../public/purchase-copy-quality');
 assert.equal(catalogueOnly('収納箱は、素材 ABS樹脂 特徴 横から物を出せます 備考 モニターで色が変わります。'),true);
 assert.equal(catalogueOnly('収納箱は、横の扉を開けると積み重ねたまま中の物を取り出せます。'),false);
});
