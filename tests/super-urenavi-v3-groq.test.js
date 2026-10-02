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
  assert.equal(p1.raw.productType.quote,p1.raw.productType.specific);
  assert.deepEqual(calls[0].body.text.format.schema.properties.productType.required,['specific','general']);
  assert.equal(calls[0].body.text.format.schema.properties.productType.properties.quote,undefined);
  assert.equal(calls[0].body.text.format.schema.properties.hooks,undefined);
  assert.equal(calls.length,1);
  assert.equal(calls[0].body.reasoning.effort,'none');
  assert.equal(calls[0].body.text.format.strict,true);
  assert.equal(calls[0].body.max_output_tokens,680);
  const pass1User=JSON.parse(calls[0].body.input[1].content[0].text);
  assert.ok(pass1User.itemCaption.length<=1200);

  const verificationInput=[{
    verificationIndex:0,
    appealIndex:0,
    proposed:{
      text:'本革の柔らかさとグリップ力で操作しやすいです。',
      scene:'長時間のツーリング',
      noHassle:''
    },
    attributes:[{
      ref:1,
      name:'プロテクション',
      value:'ナックルプロテクター入り',
      unit:'',
      qualifier:'',
      quote:'ナックルプロテクター入り'
    }]
  }];
  await groq.callPass2({
    verificationInput,
    item:{
      itemName:'バイク グローブ 本革 山羊革 ナックルプロテクター入り',
      itemCaption:'本革の柔らかさとグリップ力。スマホ対応。'
    },
    validation:{productType:{specific:'バイク グローブ',general:'バイク用グローブ'}}
  });
  assert.equal(calls.length,2);
  assert.equal(calls[1].body.text.format.name,'super_urenavi_v3_verification');
  assert.equal(calls[1].body.max_output_tokens,240);
  const pass2User=JSON.parse(calls[1].body.input[1].content[0].text);
  assert.deepEqual(pass2User.appeals,verificationInput);
  assert.equal(pass2User.itemName,undefined,'pass2 must not see the full product title');
  assert.equal(pass2User.itemCaption,undefined,'pass2 must not see the full product description');
  assert.deepEqual(pass2User.productType,{specific:'バイク グローブ',general:'バイク用グローブ'});
  assert.match(calls[1].body.input[0].content[0].text,/attributesだけ/);
  assert.match(calls[1].body.input[0].content[0].text,/supported=false/);

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
