'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {defaultCallGroq}=require('../lib/room-ai-handler');
const raw={productType:{value:'収納ケース',source:'itemName',evidence:'収納ケース'},
 features:[],sellingPoints:[],confidence:'high'};
test('Groq GPT-OSS 120B gets low reasoning, 2000 output tokens and one strict JSON request',async()=>{
 let requests=0;
 const res=await defaultCallGroq({
  apiKey:'test-only',model:'openai/gpt-oss-120b',itemName:'収納ケース',
  itemCaption:'幅20cm',itemPrice:1490,imageDataUrl:null,maxRetries:0,
  fetchImpl:async (url,options)=>{
   requests++;
   assert.equal(url,'https://api.groq.com/openai/v1/responses');
   const payload=JSON.parse(options.body);
   assert.equal(payload.model,'openai/gpt-oss-120b');
   assert.equal(payload.reasoning.effort,'low');
   assert.equal(payload.max_output_tokens,2000);
   assert.equal(payload.text.format.strict,true);
   assert.deepEqual(payload.input[1].content.map(x=>x.type),['input_text']);
   return {ok:true,status:200,headers:{get:()=>null},
    json:async()=>({output_text:JSON.stringify(raw),model:payload.model,
      usage:{input_tokens:120,output_tokens:150}})};
  }
 });
 assert.equal(requests,1);
 assert.equal(res.raw.productType.value,'収納ケース');
 assert.equal(res.usage.input_tokens,120);
});
test('legacy test fixture model retains its bounded output contract',async()=>{
 let count=0;
 await defaultCallGroq({apiKey:'test-only',model:'qwen/qwen3.8-27b',
  itemName:'収納ケース',itemCaption:'幅20cm',itemPrice:1490,maxRetries:0,
  fetchImpl:async (_url,options)=>{
   count++;
   const payload=JSON.parse(options.body);
   assert.equal(payload.reasoning.effort,'none');
   assert.equal(payload.max_output_tokens,360);
   return {ok:true,status:200,headers:{get:()=>null},
    json:async()=>({output_text:JSON.stringify(raw),model:payload.model,usage:{input_tokens:100,output_tokens:100}})};
  }});
 assert.equal(count,1);
});
