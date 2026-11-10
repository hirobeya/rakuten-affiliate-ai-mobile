'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {callStructured}=require('../../lib/super-urenavi-v3-groq');
for(const usage of [{prompt_tokens:2975,completion_tokens:2790,total_tokens:5765},undefined])test('HTTP400 preserves '+(usage?'reported usage':'unknown usage')+' without retry',async()=>{
 let calls=0;
 await assert.rejects(callStructured({apiKey:'synthetic',transport:'chat',model:'openai/gpt-oss-120b',systemPrompt:'synthetic',userPayload:{},schema:{type:'object'},schemaName:'synthetic',maxOutputTokens:3000,fetchImpl:async()=>{calls++;return {ok:false,status:400,headers:new Headers(),json:async()=>({error:{code:'json_validate_failed'},...(usage?{usage}:{})})};}}),e=>{assert.deepEqual(e.usage,usage||null);assert.equal(e.status,400);return true;});
 assert.equal(calls,1);
});
