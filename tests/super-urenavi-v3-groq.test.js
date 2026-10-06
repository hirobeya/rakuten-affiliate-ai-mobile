'use strict';

const assert=require('node:assert/strict');
const {createV3Groq,capCaption,callStructured,SEMANTIC_WRITER_PROMPT}=require('../lib/super-urenavi-v3-groq');

function response(payload,{status=200}={}){
  return {
    ok:status>=200&&status<300,status,
    headers:{get(){return null;}},
    async json(){return payload;}
  };
}

(async()=>{
  assert.match(SEMANTIC_WRITER_PROMPT,/natural, complete Japanese sentence/i);
  assert.match(SEMANTIC_WRITER_PROMPT,/verbatim, character-for-character/i);
  assert.match(SEMANTIC_WRITER_PROMPT,/do NOT force copying/i);
  assert.match(SEMANTIC_WRITER_PROMPT,/negation, conditions, exclusions, degree/i);

  const calls=[];
  const fetchImpl=async(url,opts)=>{
    calls.push({url,body:JSON.parse(opts.body)});
    const name=JSON.parse(opts.body).text.format.name;
    if(name==='super_urenavi_v3_understanding'){
      return response({model:'mock',usage:{input_tokens:10,output_tokens:20},output_text:JSON.stringify({
        productType:{specific:'バイクグローブ',general:'グローブ'},
        attributes:[
          {name:'スマホ対応',value:'可能',unit:'',qualifier:'停車中',valueType:'text',quote:'グローブを着けたままスマホを操作'},
          {name:'防護部',value:'ナックルプロテクター',unit:'',qualifier:'',valueType:'text',quote:'ナックルプロテクター入り'}
        ],
        appeals:[{
          text:'グローブを着けたままスマホを操作できます。',
          scene:'停車中にスマホを確認する場面',
          evidenceQuotes:['グローブを着けたままスマホを操作'],
          strength:3
        }]
      })});
    }
    return response({model:'mock',usage:{input_tokens:5,output_tokens:5},output_text:JSON.stringify({results:[]})});
  };
  const groq=createV3Groq({apiKey:'test',model:'mock',fetchImpl});
  const p1=await groq.callPass1({item:{itemName:'バイクグローブ',itemCaption:'グローブを着けたままスマホを操作 ナックルプロテクター入り '+ '説明'.repeat(1000),itemPrice:1000}});
  assert.equal(p1.raw.productType.specific,'バイクグローブ');
  assert.equal(p1.raw.productType.quote,p1.raw.productType.specific);
  assert.deepEqual(calls[0].body.text.format.schema.properties.productType.required,['specific','general']);
  assert.equal(calls[0].body.text.format.schema.properties.productType.properties.quote,undefined);
  assert.equal(calls[0].body.text.format.schema.properties.hooks,undefined);
  assert.equal(calls[0].body.text.format.schema.properties.appeals.items.properties.attributeRefs,undefined);
  assert.ok(calls[0].body.text.format.schema.properties.appeals.items.properties.evidenceQuotes);
  assert.deepEqual(p1.raw.appeals[0].attributeRefs,[0],'exact evidence quote must bind to the matching attribute, not an AI ordinal');
  assert.equal(p1.raw.appeals[0].evidenceQuotes,undefined);
  assert.equal(p1.raw.attributes[0].value,'グローブを着けたままスマホを操作','non-grounded value labels must normalize to the grounded quote');
  assert.equal(calls.length,1);
  assert.equal(calls[0].body.reasoning.effort,'none');
  assert.equal(calls[0].body.temperature,0.2);
  assert.equal(calls[0].body.text.format.strict,true);
  assert.equal(calls[0].body.max_output_tokens,900);
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
  assert.equal(calls[1].body.max_output_tokens,900);
  const pass2User=JSON.parse(calls[1].body.input[1].content[0].text);
  assert.deepEqual(pass2User.appeals,verificationInput);
  assert.equal(pass2User.itemName,undefined);
  assert.equal(pass2User.itemCaption,undefined);
  assert.deepEqual(pass2User.productType,{specific:'バイク グローブ',general:'バイク用グローブ'});
  assert.match(calls[1].body.input[0].content[0].text,/添付されたattributes\.quote/);
  assert.match(calls[1].body.input[0].content[0].text,/入力外の引用を新しく持ち込んではいけません/);
  assert.match(SEMANTIC_WRITER_PROMPT,/STRICT EVIDENCE SCOPE/);
  assert.match(SEMANTIC_WRITER_PROMPT,/A fact appearing elsewhere in itemName\/itemCaption is NOT allowed/);

  const alternate=createV3Groq({apiKey:'test',model:'openai/gpt-oss-120b',fetchImpl});
  await alternate.callPass1({item:{itemName:'バイクグローブ'}});
  assert.equal(calls.at(-1).body.reasoning.effort,'low');
  const mixed=await callStructured({apiKey:'test',model:'openai/gpt-oss-120b',systemPrompt:'test',userPayload:{},schema:{type:'object'},schemaName:'test',maxOutputTokens:460,fetchImpl:async()=>response({output:[
    {type:'reasoning',content:[{type:'reasoning_text',text:'Internal reasoning is not JSON'}]},
    {type:'message',content:[{type:'output_text',text:'{"ok":'},{type:'output_text',text:'true}'}]}
  ]})});
  assert.deepEqual(mixed.raw,{ok:true});
  await assert.rejects(()=>callStructured({apiKey:'test',model:'mock',schema:{},fetchImpl:async()=>response({status:'incomplete',incomplete_details:{reason:'max_output_tokens'},usage:{output_tokens:500},output:[]})}),e=>e.failureReason==='output_budget_exhausted'&&e.usage.output_tokens===500);
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
