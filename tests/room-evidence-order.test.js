'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createProvider,payload,WRITER_SCHEMA,REVIEW_SCHEMA}=require('../lib/room-semantic-provider');
const {inspect,assessReview,questions,bind}=require('../lib/room-semantic-contract');
const records=['room-copy-20261026-ipow.json','room-copy-20261026-ipow-review-scope.json'].map(f=>require('../docs/measurements/'+f).records[0]);

test('writer selects evidence before prose using the same external fields',()=>{
 const product=WRITER_SCHEMA.properties.product,sentence=WRITER_SCHEMA.properties.sentences.items;
 assert.deepEqual(Object.keys(product.properties),['acts_on_quote','what','acts_on']);
 assert.deepEqual(Object.keys(sentence.properties),['quotes','text','kinds']);
 assert.deepEqual([...product.required].sort(),['acts_on','acts_on_quote','what']);
 assert.deepEqual([...sentence.required].sort(),['kinds','quotes','text']);
 assert.deepEqual(Object.keys(REVIEW_SCHEMA.properties.sentences.items.properties),['text','evidenceQuotes','reason',...questions]);
});

test('recorded live failures receive exact source locations without rewriting sources or approving claims',()=>{
 for(const r of records){
  const item={itemName:r.item_name,itemCaption:r.item_caption_normalized,catchcopy:'8枚入れ 型崩れ防止'};
  const p=payload('verify',item,{draft:r.state.draft});
  for(const key of ['itemName','itemCaption','catchcopy'])assert.equal(p[key],item[key]);
  assert.equal(p.draft,r.state.draft);
  assert.deepEqual(p.sourceBindings.acts_on,bind(item,r.state.draft.product.acts_on_quote));
  assert.deepEqual(p.sourceBindings.sentences,r.state.draft.sentences.map(s=>s.quotes.map(q=>bind(item,q))));
  assert.equal(inspect(item,r.state.draft).ok,true);
  assert.equal(assessReview(item,r.state.draft,r.state.review).ok,false,'input enrichment must not override any AI veto');
 }
});

test('initial requests for the recorded product fit the previously observed 8000 token window estimate',()=>{
 const r=records[0],item={itemName:r.item_name,itemCaption:r.item_caption_normalized,catchcopy:'8枚入れ 型崩れ防止'};
 const p=createProvider({apiKey:'unused',fetchImpl:()=>{throw Error('LIVE_NETWORK_DISABLED');}});
 // This is a conservative request estimate and a regression bound for this
 // source only, not an account-limit lookup or a promise for other products.
 assert.ok(p.requiredTokens('generate',item,{})<=8000);
 assert.ok(p.requiredTokens('verify',item,{draft:r.state.draft})<=8000);
});

test('source locations never repair invented quotes or conceal model and negation restrictions',async()=>{
 const item={itemName:'カバー付き収納ベンチ A/B',itemCaption:'A型のカバーのみ手洗いできます。本体は洗えません。B型には付属しません。',catchcopy:''};
 const draft={product:{what:'収納ベンチ',acts_on:'収納',acts_on_quote:'架空の引用'},sentences:[{text:'本体を丸洗いできます。',kinds:['spec'],quotes:['本体は洗えません。','本体を丸洗いできます。']}]};
 let sent;const provider=createProvider({apiKey:'mock',fetchImpl:async(_url,options)=>{sent=JSON.parse(options.body);return {ok:true,headers:new Headers(),json:async()=>({choices:[{message:{content:'{}'}}],usage:{prompt_tokens:1,completion_tokens:1}})};}});
 await provider.call('verify',item,{draft});
 const p=JSON.parse(sent.messages[1].content);
 assert.equal(p.sourceBindings.acts_on,null);
 assert.equal(p.sourceBindings.sentences[0][0].quote,'本体は洗えません。');
 assert.equal(p.sourceBindings.sentences[0][1],null);
 assert.equal(p.itemCaption,item.itemCaption);
 assert.equal(inspect(item,draft).ok,false);
 for(const q of questions)assert.deepEqual(sent.response_format.json_schema.schema.properties.sentences.items.properties[q].enum,['supported','not_supported','unclear']);
 assert.equal(sent.max_completion_tokens,3000);
});
