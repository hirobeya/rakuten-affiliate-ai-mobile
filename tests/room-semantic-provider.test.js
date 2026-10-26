'use strict';const assert=require('node:assert/strict');const {createProvider,WRITER_PROMPT,REVIEW_PROMPT}=require('../lib/room-semantic-provider');
assert.match(WRITER_PROMPT,/安定した操作感が得られます/);assert.match(WRITER_PROMPT,/意味拡張も禁止/);assert.match(REVIEW_PROMPT,/Require semantic entailment, not topical similarity/);assert.match(REVIEW_PROMPT,/do NOT entail '安定した操作感が得られます'/);
{
 const {payload}=require('../lib/room-semantic-provider');
 const source={itemName:'洗濯ネット 衣類 下着 靴下 シャツ など適用',itemCaption:'洗濯ネットは衣類を保護するためのネットです。',catchcopy:'細かい網目'};
 const p=payload('generate',source,{partnerProductType:'靴下'});
 assert.equal(p.decisionKnowledge,undefined);
 assert.equal(p.itemName,source.itemName);assert.equal(p.itemCaption,source.itemCaption);assert.equal(p.catchcopy,source.catchcopy);
 const socks={itemName:'靴下 綿100％ 3足セット',itemCaption:'綿100％の靴下です。'};
 assert.equal(payload('generate',socks,{partnerProductType:'靴下'}).decisionKnowledge.productType,'靴下');
 assert.equal(payload('generate',socks,{partnerProductType:'靴下',partnerKnowledge:false}).decisionKnowledge,undefined);
}
{
 const {readFileSync}=require('node:fs');
 const recorded=JSON.parse(readFileSync('docs/measurements/room-copy-20261026-ipow.json','utf8')).records[0];
 assert.ok(recorded.item_name.includes('ブラジャー'));
 assert.ok(recorded.state.review.sentences[0].reason.includes('bras not in source'));
}
(async()=>{let body,url;const p=createProvider({apiKey:'mock',fetchImpl:async(u,o)=>{url=u;body=JSON.parse(o.body);return {ok:true,headers:new Headers(),json:async()=>({choices:[{message:{content:'{"product":{},"sentences":[]}',reasoning:'excluded'}}],usage:{total_tokens:10}})}}});const out=await p.call('generate',{itemName:'収納',itemCaption:'収納付き'},{});assert.equal(url,'https://api.groq.com/openai/v1/chat/completions');assert.equal(body.response_format.json_schema.strict,true);assert.equal(body.reasoning_effort,'medium');assert.equal(body.max_completion_tokens,3000);assert.equal(out.raw.product.constructor,Object);assert.equal(out.raw.reasoning,undefined);console.log('room-semantic-provider: PASS (strict chat schema, semantic entailment guard, reasoning excluded)');})().catch(e=>{console.error(e);process.exitCode=1;});
