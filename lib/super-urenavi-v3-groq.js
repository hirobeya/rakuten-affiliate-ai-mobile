'use strict';

const {PASS1_SCHEMA,PASS1_SYSTEM_PROMPT}=require('./super-urenavi-v3-understanding');
const {PASS2_SCHEMA,PASS2_SYSTEM_PROMPT}=require('./super-urenavi-v3-verifier');
const legacy=require('./room-ai-handler');

// Emit each fact once. Legacy duplicate identity / unused hook fields are
// reconstructed server-side and never consume the model's output budget.
const MODEL_PASS1_SCHEMA=JSON.parse(JSON.stringify(PASS1_SCHEMA));
MODEL_PASS1_SCHEMA.required=['productType','attributes','appeals'];
delete MODEL_PASS1_SCHEMA.properties.decisionAxes;
delete MODEL_PASS1_SCHEMA.properties.hooks;
MODEL_PASS1_SCHEMA.properties.productType.required=['specific','general'];
delete MODEL_PASS1_SCHEMA.properties.productType.properties.quote;
MODEL_PASS1_SCHEMA.properties.attributes.maxItems=4;
MODEL_PASS1_SCHEMA.properties.appeals.maxItems=2;
MODEL_PASS1_SCHEMA.properties.appeals.items.required=['text','scene','attributeRefs','strength'];
delete MODEL_PASS1_SCHEMA.properties.appeals.items.properties.noHassle;

const DEFAULT_MODEL='qwen/qwen3.8-27b';
const MIN_INTERVAL_MS=800;
const TIMEOUT_MS=10000;
let serialTail=Promise.resolve();
let lastStartAt=0;

function sleep(ms){return new Promise(resolve=>setTimeout(resolve,Math.max(0,ms||0)));}

function serial(task){
  const run=async()=>{
    const gap=Date.now()-lastStartAt;
    if(gap<MIN_INTERVAL_MS) await sleep(MIN_INTERVAL_MS-gap);
    lastStartAt=Date.now();
    return task();
  };
  const next=serialTail.then(run,run);
  serialTail=next.catch(()=>{});
  return next;
}

function outputText(data){
  if(typeof data?.output_text==='string') return data.output_text;
  for(const out of data?.output||[]){
    for(const c of out?.content||[]){
      if(typeof c?.text==='string') return c.text;
    }
  }
  return '';
}

function capCaption(value='',max=1200){
  const s=String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
  if(s.length<=max) return s;
  const head=Math.floor(max*0.72);
  const tail=max-head-3;
  return s.slice(0,head)+' … '+s.slice(-tail);
}

async function callStructured({
  apiKey,
  model=DEFAULT_MODEL,
  systemPrompt,
  userPayload,
  schema,
  schemaName,
  maxOutputTokens,
  fetchImpl=fetch
}){
  if(!apiKey) throw new Error('GROQ_API_KEY is not configured');
  return serial(async()=>{
    const controller=new AbortController();
    const timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
    try{
      const response=await fetchImpl('https://api.groq.com/openai/v1/responses',{
        method:'POST',
        headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
        body:JSON.stringify({
          model,
          reasoning:{effort:'none'},
          input:[
            {role:'system',content:[{type:'input_text',text:String(systemPrompt||'')}]},
            {role:'user',content:[{type:'input_text',text:JSON.stringify(userPayload||{})}]}
          ],
          text:{format:{type:'json_schema',name:schemaName,strict:true,schema}},
          max_output_tokens:maxOutputTokens
        }),
        signal:controller.signal
      });
      const rateLimit=legacy.rateLimitHeaders(response.headers);
      const data=await response.json().catch(()=>({}));
      if(!response.ok){
        const error=new Error(`Groq request failed (${response.status})`);
        error.status=response.status;
        error.rateLimit=rateLimit;
        error.safeError=legacy.safeGroqError(response.status,data);
        throw error;
      }
      const text=outputText(data);
      if(!text) throw new Error('Groq returned no structured output');
      let raw;
      try{raw=JSON.parse(text);}catch{throw new Error('Groq returned invalid JSON');}
      return {raw,model:data.model||model,usage:data.usage||null,rateLimit};
    }finally{
      clearTimeout(timer);
    }
  });
}

function createV3Groq({apiKey,model=DEFAULT_MODEL,fetchImpl=fetch}={}){
  return {
    callPass1:async({item})=>{const response=await callStructured({
      apiKey,model,fetchImpl,
      systemPrompt:PASS1_SYSTEM_PROMPT+' 出力schemaにないquote/decisionAxes/hooks/noHassleは出力しません。productType.specific自体が原文の連続引用です。山羊革とグローブが原文で離れている場合、山羊革グローブと連結せず原文にあるグローブをspecificにし、山羊革は素材属性にします。appeals.attributeRefsは、そのappealのtextとsceneを実際に支えるattributesの配列番号だけを指定してください。各appealを出す直前に、参照番号のattribute.name/value/quoteと訴求内容が意味的に一致するか確認し、一致しない番号は絶対に付けないでください。根拠属性が見つからないappealは出力しません。',
      userPayload:{
        itemName:String(item?.itemName||'').slice(0,1000),
        itemCaption:capCaption(item?.itemCaption||''),
        itemPrice:Number(item?.itemPrice)||0
      },
      schema:MODEL_PASS1_SCHEMA,
      schemaName:'super_urenavi_v3_understanding',
      maxOutputTokens:680
    });
      const raw=response.raw;
      if(raw?.productType) raw.productType.quote=raw.productType.specific;
      raw.decisionAxes=[];raw.hooks=[];
      for(const a of raw.appeals||[]) a.noHassle='';
      return response;
    },
    callPass2:({verificationInput,validation})=>callStructured({
      apiKey,model,fetchImpl,
      systemPrompt:PASS2_SYSTEM_PROMPT+' 商品原文全体は与えられません。各appealに添付されたattributesだけで判定し、そこから直接言えない訴求は必ずsupported=falseにしてください。すべての入力appealについて結果を1件ずつ返してください。',
      userPayload:{productType:validation?.productType,appeals:verificationInput},
      schema:PASS2_SCHEMA,
      schemaName:'super_urenavi_v3_verification',
      maxOutputTokens:240
    })
  };
}

module.exports={DEFAULT_MODEL,MIN_INTERVAL_MS,TIMEOUT_MS,capCaption,callStructured,createV3Groq};
