'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const {MODEL,CAPS,AXES,hash,fixedInputs,prepareArm,prepareReview,assessStored,prepareReport}
 =require('../../lib/urenavi-core/generation-comparison');

const item={
 itemCode:'offline:test',itemName:'収納ボックス',
 itemCaption:'収納ボックスは、仕切りが付いています。\nそのため、食材を分けて収納できます。',itemPrice:1200
};
const sourceHash=hash([item.itemName,item.itemCaption,item.itemPrice]);
const index=[{category:'household',itemCode:item.itemCode,inputSha256:sourceHash}];
const raw=[{category:'household',item:{...item,catchcopy:'not in frozen hash',affiliateUrl:'private metadata'}}];
const [record]=fixedInputs(index,raw);
const draft={product:{what:'収納ボックス',acts_on:'食材を分けて収納',acts_on_quote:'食材を分けて収納できます'},
 sentences:[{text:'仕切りの付いた収納ボックスで、食材を分けて収納できます。',
  quotes:['収納ボックス','仕切りが付いています','食材を分けて収納できます'],kinds:['spec','benefit']}]};

test('pins original inputs, rejects substitutions, drops unpinned fields',()=>{
 assert.equal(record.item.itemCaption,item.itemCaption);
 assert.equal(Object.hasOwn(record.item,'catchcopy'),false);
 assert.throws(()=>fixedInputs(index,[{...raw[0],item:{...item,itemCaption:item.itemCaption+'。'}}]),/frozen_input_mismatch/);
 assert.throws(()=>fixedInputs(index,[raw[0],raw[0]]),/frozen_input_count_or_duplicate/);
});
test('B and C share the same complete source and wire settings; only C has bound hints',()=>{
 const b=prepareArm(record,'B'),c=prepareArm(record,'C');
 assert.equal(b.stop,null);
 assert.equal(c.stop,null);
 const rawPayload=JSON.parse(b.writer.body.messages[1].content);
 const {sourceEvidenceHints,linkedSourceEvidence,...same}=JSON.parse(c.writer.body.messages[1].content);
 assert.deepEqual(rawPayload,{itemName:item.itemName,itemCaption:item.itemCaption});
 assert.deepEqual(same,rawPayload);
 assert.ok((linkedSourceEvidence||sourceEvidenceHints).every(x=>x.publicationApproved===false));
 assert.equal(b.writer.body.messages[0].content,c.writer.body.messages[0].content);
 assert.equal(b.writer.body.max_completion_tokens,CAPS.writer);
 assert.notEqual(b.writer.requestHash,c.writer.requestHash);
 assert.notEqual(b.attemptIds.writer,c.attemptIds.writer);
 assert.notEqual(c.attemptIds.writer,c.attemptIds.review);
 assert.deepEqual(c.attemptIds,prepareArm(record,'C').attemptIds);
 assert.equal(prepareArm({...record,item:{...item,itemCaption:'無関係な文章。'}},'C').stop,'no_distinct_grounded_hints');
 assert.equal(prepareArm({...record,item:{...item,itemCaption:'あ'.repeat(10000)}},'B').stop,'writer_over_reference_window');
});
test('replay requires exact writer and independent reviewer identities and still enforces vetoes',()=>{
 const b=prepareArm(record,'B');
 const pending=prepareReview(record,b,draft);
 assert.equal(pending.ok,true,JSON.stringify(pending));
 const review={product:{what:'supported',acts_on:'supported'},sentences:[{
  text:draft.sentences[0].text,evidenceQuotes:draft.sentences[0].quotes,reason:'literal source',
  target:'supported',part:'supported',conditions:'supported',negation:'supported',degree:'supported'
 }],quality:{identity:'supported',reason:'supported',scene:'supported',natural:'supported',non_redundant:'supported',room_style:'supported'}};
 const receipt={arm:'B',itemCode:item.itemCode,sourceHash,model:MODEL,reviewModel:MODEL,
  writerRequestHash:b.writer.requestHash,reviewRequestHash:pending.request.requestHash,draft,review};
 assert.equal(assessStored(record,b,receipt).publication,'ready');
 assert.equal(assessStored(record,b,{...receipt,writerRequestHash:'stale'}).status,'unmeasured');
 assert.equal(assessStored(record,b,{...receipt,reviewRequestHash:'stale'}).publication,'blocked');
 const ungrounded=structuredClone(draft);ungrounded.sentences[0].text=ungrounded.sentences[0].text.replace('食材','食材50kg');
 assert.equal(assessStored(record,b,{...receipt,draft:ungrounded}).reason,'mechanical_gate_blocked');
 review.sentences[0].part='not_supported';
 assert.equal(assessStored(record,b,receipt).publication,'blocked');
});
test('orders reports by manifest and leaves unsupported comparisons unmeasured',()=>{
 const r=prepareReport(index,raw,{evaluations:[{itemCode:item.itemCode,arm:'A',author:'assistant',textHash:'stale',
  axes:Object.fromEntries(AXES.map(k=>[k,'pass']))}]});
 assert.equal(r.rows[0].B.status,'unmeasured');
 assert.equal(r.rows[0].C.status,'unmeasured');
 assert.equal(r.rows[0].B.plan.pricedCeilingUsd,null);
 assert.equal(r.currentAvailableCapacity,null);
 assert.equal(r.liveAuthorized,false);
 assert.equal(r.totals.maximumCalls,4);
 assert.equal(r.paired.maximumCalls,4);
 assert.equal(r.summary.A.qualityPass,0);
});
