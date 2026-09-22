'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {runTwoStageGroq}=require('../api/room-ai');

(async()=>{
  const apiSrc=fs.readFileSync(path.join(__dirname,'../api/room-ai.js'),'utf8');
  const appSrc=fs.readFileSync(path.join(__dirname,'../public/app.html'),'utf8');
  const runtimeSrc=fs.readFileSync(path.join(__dirname,'../api/runtime-env.js'),'utf8');

  assert.match(apiSrc,/const DEFAULT_DAILY_LIMIT=120;/);
  assert.match(apiSrc,/Math\.min\(DEFAULT_DAILY_LIMIT,limitRaw\)/);
  assert.match(apiSrc,/maxOutputTokens=320/);
  assert.match(apiSrc,/allowImage:false/);
  assert.match(apiSrc,/retryableJson400/);

  assert.match(appSrc,/FREE_TIER_AI_PER_SEARCH_LIMIT=2/);
  assert.match(appSrc,/fallbackFacts\.length>=1/);
  assert.match(appSrc,/insufficient_grounded_facts/);
  assert.match(appSrc,/rule_conflict/);
  assert.match(appSrc,/data-item-index="\$\{n\}"/);
  assert.match(appSrc,/\.item\[data-item-index=/);
  assert.match(appSrc,/product-shadow-v2\.js/);
  assert.match(appSrc,/if\(aiGatesFullOutput\)\{/);

  assert.doesNotMatch(appSrc,/debugExport/);
  assert.doesNotMatch(appSrc,/DEBUG_BATCH_KEYWORDS/);
  assert.doesNotMatch(appSrc,/data-ai-review/);
  assert.doesNotMatch(appSrc,/Preview・owner限定/);
  assert.doesNotMatch(appSrc,/ai-preview-diagnostic/);

  assert.match(runtimeSrc,/aiGatesFullOutput:environment==='production'/);

  let calls=0,images=0;
  const out=await runTwoStageGroq({
    callAI:async()=>{calls++;return {raw:{productType:{value:'バイクグローブ',source:'itemName',evidence:'バイクグローブ'},features:[],confidence:'high'},model:'test',usage:{input_tokens:500,output_tokens:50}};},
    apiKey:'x',model:'test',itemName:'バイクグローブ',itemCaption:'',itemPrice:1000,imageUrl:'https://example.invalid/x.jpg',
    imageLoader:async()=>{images++;return {available:true,dataUrl:'data:image/jpeg;base64,AA=='};},
    allowImage:false
  });
  assert.equal(calls,1);
  assert.equal(images,0);
  assert.equal(out.stages.imageAttempted,false);
  console.log('Production AI regression passed');
})().catch(e=>{console.error(e);process.exit(1);});
