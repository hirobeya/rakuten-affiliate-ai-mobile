'use strict';const assert=require('node:assert/strict');const {createProvider,WRITER_PROMPT,REVIEW_PROMPT}=require('../lib/room-semantic-provider');
const {payload}=require('../lib/room-semantic-provider');
const {normalize}=require('../lib/room-semantic-contract');
const draft={product:{what:'保管ケース',acts_on:'持ち物',acts_on_quote:'収納'},sentences:[{text:'保管ケースです。\n幅１０cm。',kinds:['spec'],quotes:['幅10cm']}]};
const reviewInput=payload('verify',{itemName:'保管ケース',itemCaption:'幅10cm'}, {draft});
assert.equal(reviewInput.proposedPost,draft.sentences.map(s=>normalize(s.text)).join('\n\n'));
assert.equal(reviewInput.draft,draft);
assert.match(WRITER_PROMPT,/安定した操作感が得られます/);assert.match(WRITER_PROMPT,/意味拡張も禁止/);assert.match(REVIEW_PROMPT,/Require semantic entailment, not topical similarity/);assert.match(REVIEW_PROMPT,/do NOT entail '安定した操作感が得られます'/);
(async()=>{let body,url;const p=createProvider({apiKey:'mock',fetchImpl:async(u,o)=>{url=u;body=JSON.parse(o.body);return {ok:true,headers:new Headers(),json:async()=>({choices:[{message:{content:'{"product":{},"sentences":[]}',reasoning:'excluded'}}],usage:{total_tokens:10}})}}});const out=await p.call('generate',{itemName:'収納',itemCaption:'収納付き'},{});assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');assert.equal(body.response_format.json_schema.strict,true);assert.equal(body.reasoning_effort,'medium');assert.equal(body.max_completion_tokens,3000);assert.equal(out.raw.product.constructor,Object);assert.equal(out.raw.reasoning,undefined);console.log('room-semantic-provider: PASS (strict chat schema, semantic entailment guard, reasoning excluded)');})().catch(e=>{console.error(e);process.exitCode=1;});
