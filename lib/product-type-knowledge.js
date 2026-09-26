'use strict';

const KNOWLEDGE_PROMPT_VERSION='2026-09-26-product-type-knowledge-v1';
const KNOWLEDGE_SCHEMA_VERSION='product_type_knowledge_v1';
const DEFAULT_MODEL='qwen/qwen3.8-27b';
const TIMEOUT_MS=7000;

const BLOCKED_RE=/絶対|必ず|確実|改善|治る|痩せる|若返|安全|安心|無害|保証|医療|治療|予防|効果|効能|最強|No\.?\s*1|ランキング|受賞|送料無料|クーポン|セール|SALE|OFF|半額|ポイント|おすすめ/i;
const CAPABILITY_RE=/防水|防塵|急速充電|高速充電|長時間|大容量|軽量|静音|抗菌|除菌|消臭|保温|保冷|省エネ|高画質|高音質|自動|ワイヤレス|折りたたみ|洗える|収納|USB|Bluetooth|Type-C|HDMI/i;

const schema={
  type:'object',additionalProperties:false,
  required:['productType','readerSituations','decisionAxes'],
  properties:{
    productType:{type:'string',maxLength:32},
    readerSituations:{type:'array',maxItems:3,items:{type:'string',maxLength:32}},
    decisionAxes:{type:'array',maxItems:3,items:{type:'string',maxLength:32}}
  }
};

const SYSTEM_PROMPT=`楽天市場で使う商品タイプ別の「購入検討コンテキスト」を作成する。入力は商品タイプ名だけ。readerSituationsは、その商品タイプを探す人が一般に置かれうる利用状況を短い名詞句で最大3件。decisionAxesは購入時に比較しうる一般的な観点を短い名詞句で最大3件。個別商品の機能・性能・効果・安全性を断定しない。数字、ブランド、ランキング、販促、医療美容効果、購入後の変化は書かない。productTypeは入力をそのまま返す。この知識は文章へ直接出力せず、根拠事実の優先順位付けだけに使う。`;

function normalize(value=''){
  return String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
}

function normalizeType(value=''){
  return normalize(value).toLocaleLowerCase('ja-JP');
}

function cleanList(values){
  const out=[],seen=new Set();
  for(const raw of Array.isArray(values)?values:[]){
    const x=normalize(raw);
    if(!x||x.length>32||/[0-9０-９]/.test(x)||BLOCKED_RE.test(x)||CAPABILITY_RE.test(x)) continue;
    const key=x.toLocaleLowerCase('ja-JP');
    if(seen.has(key)) continue;
    seen.add(key);out.push(x);
    if(out.length>=3) break;
  }
  return out;
}

function validateKnowledge(raw,productType){
  const expected=normalizeType(productType);
  const actual=normalizeType(raw?.productType||'');
  if(!expected||actual!==expected) return {valid:false,reason:'product_type_mismatch',knowledge:null};
  const readerSituations=cleanList(raw?.readerSituations);
  const decisionAxes=cleanList(raw?.decisionAxes);
  if(!readerSituations.length&&!decisionAxes.length) return {valid:false,reason:'no_safe_knowledge',knowledge:null};
  return {
    valid:true,
    reason:null,
    knowledge:{
      productType:normalize(productType),
      readerSituations,
      decisionAxes,
      usage:'ranking_only',
      promptVersion:KNOWLEDGE_PROMPT_VERSION,
      schemaVersion:KNOWLEDGE_SCHEMA_VERSION
    }
  };
}

function extractOutputText(data){
  if(typeof data?.output_text==='string') return data.output_text;
  for(const out of data?.output||[]){
    for(const c of out?.content||[]){
      if(typeof c?.text==='string') return c.text;
    }
  }
  return '';
}

async function defaultCallKnowledgeGroq({apiKey,model=DEFAULT_MODEL,productType,fetchImpl=fetch}){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),TIMEOUT_MS);
  try{
    const r=await fetchImpl('https://api.groq.com/openai/v1/responses',{
      method:'POST',
      headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},
      body:JSON.stringify({
        model,
        reasoning:{effort:'none'},
        input:[
          {role:'system',content:[{type:'input_text',text:SYSTEM_PROMPT}]},
          {role:'user',content:[{type:'input_text',text:JSON.stringify({productType:normalize(productType)})}]}
        ],
        text:{format:{type:'json_schema',name:'urenavi_product_type_knowledge',strict:true,schema}},
        max_output_tokens:220
      }),
      signal:controller.signal
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok){
      const err=new Error(`Groq product-type knowledge failed (${r.status})`);
      err.status=r.status;
      throw err;
    }
    const text=extractOutputText(data);
    if(!text) throw new Error('Groq product-type knowledge returned no output');
    const raw=JSON.parse(text);
    return {raw,model:data.model||model,usage:data.usage||null};
  }finally{clearTimeout(timer);}
}

async function resolveTypeKnowledge({productType,store,apiKey='',model=DEFAULT_MODEL,generateOnMiss=false,callKnowledge=defaultCallKnowledgeGroq}){
  const type=normalize(productType);
  if(!type||!store) return {status:'skipped',knowledge:null,groqCalls:0};

  let cached;
  try{cached=await store.loadTypeKnowledge(type);}
  catch(error){return {status:'cache_unavailable',knowledge:null,groqCalls:0,error:error?.message||'cache unavailable'};}

  if(cached){
    if(cached.validation_status==='valid'){
      const checked=validateKnowledge(cached.raw_ai_json,type);
      if(checked.valid) return {status:'hit',knowledge:checked.knowledge,groqCalls:0,model:cached.model||''};
    }
    if(cached.validation_status==='invalid') return {status:'negative_hit',knowledge:null,groqCalls:0,model:cached.model||''};
  }

  if(!generateOnMiss) return {status:'miss',knowledge:null,groqCalls:0};
  if(!String(apiKey||'').trim()) return {status:'no_api_key',knowledge:null,groqCalls:0};

  const ai=await callKnowledge({apiKey:String(apiKey).trim(),model,productType:type});
  const checked=validateKnowledge(ai.raw,type);
  try{
    await store.saveTypeKnowledge({
      productType:type,
      model:ai.model||model,
      promptVersion:KNOWLEDGE_PROMPT_VERSION,
      schemaVersion:KNOWLEDGE_SCHEMA_VERSION,
      rawAiJson:ai.raw,
      validationStatus:checked.valid?'valid':'invalid'
    });
  }catch(error){
    return {status:'write_unavailable',knowledge:checked.valid?checked.knowledge:null,groqCalls:1,model:ai.model||model,error:error?.message||'cache write unavailable'};
  }
  return {status:checked.valid?'generated':'generated_invalid',knowledge:checked.valid?checked.knowledge:null,groqCalls:1,model:ai.model||model};
}

module.exports={
  KNOWLEDGE_PROMPT_VERSION,KNOWLEDGE_SCHEMA_VERSION,DEFAULT_MODEL,SYSTEM_PROMPT,schema,
  normalize,normalizeType,cleanList,validateKnowledge,defaultCallKnowledgeGroq,resolveTypeKnowledge,
  BLOCKED_RE,CAPABILITY_RE
};
