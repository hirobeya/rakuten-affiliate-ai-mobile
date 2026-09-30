'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const gen=require('../lib/room-post-generator-v1');
const {loadImageDataUrl}=require('../lib/room-ai-handler');

const fixtures=require('../tests/fixtures/room-post-golden-50.json');
const apiKey=String(process.env.GROQ_API_KEY||'').trim();
const models=String(process.env.GROQ_ROOM_MODELS||process.env.GROQ_ROOM_MODEL||gen.DEFAULT_MODEL).split(',').map(x=>x.trim()).filter(Boolean);
const repeat=Math.max(1,Math.min(2,Number(process.env.URENAVI_GOLDEN_REPEAT||2)||2));
const requestGapMs=Math.max(5000,Math.min(120000,Number(process.env.URENAVI_GROQ_GAP_MS||10000)||10000));
const max429Retries=Math.max(0,Math.min(5,Number(process.env.URENAVI_GROQ_429_RETRIES||3)||3));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function loadLegacy(){
  const code=fs.readFileSync(path.join(__dirname,'../public/pain-copy.js'),'utf8');
  const sandbox={Intl,console};sandbox.window=sandbox;vm.runInNewContext(code,sandbox,{filename:'pain-copy.js'});return sandbox.UrenaviPainCopy;
}
const legacy=loadLegacy();
function oldCopy(item){try{return String(legacy.makeRoomCopy(item,'')||'');}catch{return '';}}
function safetyFlags(final,input){
  const post=String(final?.post_text||'');
  return {
    understood:final?.understood===true,
    internalLeak:gen.INTERNAL_PATTERNS.some(re=>re.test(post)),
    legalNg:gen.LEGAL_PATTERNS.some(re=>re.test(post)),
    abstract:gen.ABSTRACT_PATTERNS.some(re=>re.test(post)),
    unsupportedNumber:gen.hasUnsupportedNumber(post,input.sourceText),
    hasCopy:Boolean(post.trim())
  };
}
function isRateLimitError(error){
  return Number(error?.status)===429||/\b429\b|rate\s*limit|too many requests/i.test(String(error?.message||''));
}
function retryWaitMs(error,attempt){
  const retryAfter=Number(error?.retryAfter);
  if(Number.isFinite(retryAfter)&&retryAfter>0)return Math.max(requestGapMs,Math.ceil(retryAfter*1000)+1000);
  return Math.max(requestGapMs,15000*(attempt+1));
}
async function groqWith429Retry(args){
  let lastError;
  for(let attempt=0;attempt<=max429Retries;attempt++){
    try{return await gen.callGroqOnce(args);}catch(error){
      lastError=error;
      if(!isRateLimitError(error)||attempt===max429Retries)throw error;
      const waitMs=retryWaitMs(error,attempt);
      process.stderr.write(`[groq] 429 rate limit; retry ${attempt+1}/${max429Retries} after ${waitMs}ms\n`);
      await sleep(waitMs);
    }
  }
  throw lastError;
}
function normalizeUsage(usage){
  if(!usage||typeof usage!=='object')return null;
  const inputTokens=Number(usage.input_tokens??usage.prompt_tokens??0)||0;
  const outputTokens=Number(usage.output_tokens??usage.completion_tokens??0)||0;
  const totalTokens=Number(usage.total_tokens??(inputTokens+outputTokens))||0;
  return{inputTokens,outputTokens,totalTokens};
}
function sumUsage(list){
  return list.filter(Boolean).reduce((a,u)=>({inputTokens:a.inputTokens+u.inputTokens,outputTokens:a.outputTokens+u.outputTokens,totalTokens:a.totalTokens+u.totalTokens}),{inputTokens:0,outputTokens:0,totalTokens:0});
}
function p90(a){const s=a.filter(Number.isFinite).sort((x,y)=>x-y);return s.length?s[Math.min(s.length-1,Math.ceil(s.length*.9)-1)]:null;}
function avg(a){const s=a.filter(Number.isFinite);return s.length?s.reduce((x,y)=>x+y,0)/s.length:null;}
function max(a){const s=a.filter(Number.isFinite);return s.length?Math.max(...s):null;}

async function call(item,model){
  const input=gen.prepareInput(item);const started=Date.now();const short=gen.effectiveTextLength(input)<gen.MIN_DESCRIPTION_CHARS;
  let imageDataUrl=null;
  const usages=[];
  if(short&&input.imageUrl){const img=await loadImageDataUrl(input.imageUrl);if(img?.available)imageDataUrl=img.dataUrl;}
  let ai=await groqWith429Retry({apiKey,model,input,imageDataUrl});usages.push(normalizeUsage(ai.usage));let calls=1,route=imageDataUrl?'image_first':'text';
  if(ai.raw?.understood!==true&&!imageDataUrl&&input.imageUrl){const img=await loadImageDataUrl(input.imageUrl);if(img?.available){await sleep(requestGapMs);ai=await groqWith429Retry({apiKey,model,input,imageDataUrl:img.dataUrl});usages.push(normalizeUsage(ai.usage));calls=2;route='text_then_image';}}
  const inspection=gen.inspectOutput(ai.raw,input);
  return {route,calls,elapsedMs:Date.now()-started,raw:ai.raw,final:inspection.final,removedSentenceCount:inspection.removedSentenceCount,usage:sumUsage(usages),flags:safetyFlags(inspection.final,input)};
}
async function main(){
  if(fixtures.length!==50)throw new Error(`golden set must contain 50 products, got ${fixtures.length}`);
  const categories=new Map();for(const x of fixtures)categories.set(x.category,(categories.get(x.category)||0)+1);
  if(categories.size!==10||[...categories.values()].some(n=>n!==5))throw new Error('golden set must be 10 categories x 5 products');
  if(!apiKey){throw new Error('GROQ_API_KEY is required for live golden run');}
  const report={generatedAt:new Date().toISOString(),models,repeat,count:fixtures.length,categories:Object.fromEntries(categories),requestGapMs,max429Retries,results:[]};
  let requestOrdinal=0;
  for(const model of models){
    for(let index=0;index<fixtures.length;index++){
      const item=fixtures[index],runs=[];
      for(let r=0;r<repeat;r++){
        if(requestOrdinal>0)await sleep(requestGapMs);
        try{runs.push(await call(item,model));}catch(error){runs.push({error:String(error?.message||error),status:error?.status||null,retryAfter:error?.retryAfter||null,elapsedMs:null});}
        requestOrdinal++;
      }
      report.results.push({index:index+1,id:item.id,category:item.category,itemName:item.itemName,model,legacyPost:oldCopy(item),runs});
      process.stderr.write(`[${model}] ${index+1}/50 ${item.id}\n`);
    }
  }
  const allRuns=report.results.flatMap(x=>x.runs).filter(x=>!x.error);
  const errorRuns=report.results.flatMap(x=>x.runs).filter(x=>x.error);
  const accidents=allRuns.filter(x=>x.flags&&(x.flags.internalLeak||x.flags.legalNg||x.flags.unsupportedNumber));
  const stopped=allRuns.filter(x=>x.flags&&!x.flags.understood);
  const abstract=allRuns.filter(x=>x.flags?.abstract);
  const textTimes=allRuns.filter(x=>x.route==='text').map(x=>x.elapsedMs);
  const imageTimes=allRuns.filter(x=>x.route!=='text').map(x=>x.elapsedMs);
  const inputTokens=allRuns.map(x=>x.usage?.inputTokens);
  const outputTokens=allRuns.map(x=>x.usage?.outputTokens);
  const totalTokens=allRuns.map(x=>x.usage?.totalTokens);
  report.automaticSummary={
    completedRunCount:allRuns.length,errorRunCount:errorRuns.length,accidentCount:accidents.length,stoppedCount:stopped.length,
    stopRate:allRuns.length?stopped.length/allRuns.length:null,abstractCount:abstract.length,textP90Ms:p90(textTimes),imageP90Ms:p90(imageTimes),
    tokenUsage:{input:{average:avg(inputTokens),p90:p90(inputTokens),max:max(inputTokens)},output:{average:avg(outputTokens),p90:p90(outputTokens),max:max(outputTokens)},total:{average:avg(totalTokens),p90:p90(totalTokens),max:max(totalTokens)}},
    humanReadyRequired:'40/50そのまま投稿、48/50少し直せば使える、商品特定90%以上を別途判定'
  };
  fs.mkdirSync(path.join(__dirname,'../tests/reports'),{recursive:true});
  const out=path.join(__dirname,'../tests/reports/room-post-golden-latest.json');fs.writeFileSync(out,JSON.stringify(report,null,2));
  console.log(JSON.stringify({ok:errorRuns.length===0,report:out,automaticSummary:report.automaticSummary},null,2));
  if(errorRuns.length)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
