'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {createProvider}=require('../lib/room-semantic-provider');
const {questions,publication}=require('../lib/room-semantic-contract');
const record=require('../docs/measurements/room-copy-20261026-ipow.json').records[0];

test('review request keeps full-source scope near target verdict without changing fixed questions',async()=>{
 let request;
 const provider=createProvider({apiKey:'mock',fetchImpl:async(url,options)=>{
  request=JSON.parse(options.body);
  return {ok:true,headers:new Headers(),json:async()=>({choices:[{message:{content:'{}'}}],usage:{prompt_tokens:1,completion_tokens:1}})};
 }});
 const item={itemName:record.item_name,itemCaption:record.item_caption_normalized,catchcopy:'8枚入れ 型崩れ防止'};
 await provider.call('verify',item,{draft:record.state.draft});
 const schema=request.response_format.json_schema.schema;
 const sentences=schema.properties.sentences;
 assert.equal(sentences.minItems,record.state.draft.sentences.length);
 assert.equal(sentences.maxItems,record.state.draft.sentences.length);
 assert.deepEqual(sentences.items.properties.text.enum,record.state.draft.sentences.map(x=>x.text));
 for(const q of questions)assert.deepEqual(sentences.items.properties[q].enum,['supported','not_supported','unclear']);
 assert.match(sentences.items.properties.target.description,/complete itemName, itemCaption and catchcopy/);
 assert.match(sentences.items.properties.evidenceQuotes.description,/continuous exact ORIGINAL/);
 assert.match(schema.properties.quality.description,/independently of factual safety/);
 assert.equal(request.max_completion_tokens,3000);
 const source=JSON.parse(request.messages.find(x=>x.role==='user').content);
 assert.equal(source.itemName,item.itemName);
 assert.equal(source.itemCaption,item.itemCaption);
 assert.equal(publication(item,record.state.draft,record.state.review).status,'blocked');
});
