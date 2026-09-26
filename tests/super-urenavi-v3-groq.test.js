'use strict';

const assert=require('node:assert/strict');
const {createV3Groq,capCaption}=require('../lib/super-urenavi-v3-groq');

function response(payload,{status=200}={}){
  return {
    ok:status>=200&&status<300,status,
    headers:{get(){return null;}},
    async json(){return payload;}
  };
}

(async()=>{
  const calls=[];
  const fetchImpl=async(url,opts)=>{
    calls.push({url,body:JSON.parse(opts.body)});
    const name=JSON.parse(opts.body).text.format.name;
    if(name==='super_urenavi_v3_understanding'){
      return response({model:'mock',usage:{input_tokens:10,output_tokens:20},output_text:JSON.stringify({
        productType:{specific:'電気ケトル',general:'ケトル',quote:'電気ケトル'},attributes:[],decisionAxes:[],appeals:[],hooks:[]
      })});
    }
    return response({model:'mock',usage:{input_tokens:5,output_tokens:5},output_text:JSON.stringify({results:[]})});
  };
  const groq=createV3Groq({apiKey:'test',model:'mock',fetchImpl});
  const p1=await groq.callPass1({item:{itemName:'電気ケトル',itemCaption:'説明'.repeat(1000),itemPrice:1000}});
  assert.equal(p1.raw.productType.specific,'電気ケトル');
  assert.equal(calls.length,1);
  assert.equal(calls[0].body.reasoning.effort,'none');
  assert.equal(calls[0].body.text.format.strict,true);
  assert.equal(calls[0].body.max_output_tokens,720);
  const pass1User=JSON.parse(calls[0].body.input[1].content[0].text);
  assert.ok(pass1User.itemCaption.length<=1200);

  await groq.callPass2({verificationInput:[{verificationIndex:0,appealIndex:0,proposed:{text:'例'},attributes:[]}]});
  assert.equal(calls.length,2);
  assert.equal(calls[1].body.text.format.name,'super_urenavi_v3_verification');
  assert.equal(calls[1].body.max_output_tokens,320);

  let errorCalls=0;
  const failing=createV3Groq({apiKey:'test',model:'mock',fetchImpl:async()=>{
    errorCalls++;
    return response({error:{type:'rate_limit_error',message:'limited'}},{status:429});
  }});
  await assert.rejects(()=>failing.callPass1({item:{itemName:'x'}}),e=>e?.status===429);
  assert.equal(errorCalls,1,'v3 must not hide extra Groq retries behind one logical pass');

  assert.ok(capCaption('a'.repeat(5000)).length<=1200);
  console.log('super-urenavi-v3-groq.test.js: PASS');
})().catch(error=>{console.error(error);process.exitCode=1;});
