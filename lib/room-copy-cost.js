'use strict';
const {createHash}=require('node:crypto');
// Official model-list snapshot, 2026-10-11. USD / one million tokens.
const PRICES={'openai/gpt-oss-120b':{input:.15,output:.60},'openai/gpt-oss-20b':{input:.075,output:.30}};
function count(value){return Number.isSafeInteger(value)&&value>=0?value:null;}
function measure({model,usage,calls=1,elapsedMs=0,owner='',stage='',failed=false}){
 const input=count(usage?.input_tokens??usage?.prompt_tokens),output=count(usage?.output_tokens??usage?.completion_tokens);
 const free=calls===0,price=PRICES[model];
 return {schema:'urenavi_copy_cost_v1',account:owner?createHash('sha256').update('urenavi-cost-v1:'+owner.trim().toLowerCase()).digest('hex'):null,model,stage,failed,calls,
  inputTokens:free?0:input,outputTokens:free?0:output,elapsedMs,
  estimatedUsd:free?0:price&&input!==null&&output!==null?(input*price.input+output*price.output)/1e6:null,
  usagePlanPolicy:'free',chargedUsd:null,estimateMeaning:'paid_list_price_equivalent_not_invoice',pricingDate:'2026-10-11',basis:free?'no_provider_call':!price?'model_price_unknown':input===null||output===null?'usage_unknown':'provider_tokens_x_list_price'};
}
function logger(row){console.log('urenavi copy cost',JSON.stringify(row));}
function meteredProvider(provider,{owner,log=logger,now=Date.now}={}){
 return {...provider,async call(stage,item,state){
  const started=now();
  try{const result=await provider.call(stage,item,state);log(measure({model:result.model||provider.model,usage:result.usage,owner,stage,elapsedMs:now()-started}));return result;}
  catch(e){log(measure({model:provider.model,usage:e.usage,owner,stage,failed:true,elapsedMs:now()-started}));throw e;}
 }};
}
function summarize(rows){
 const total=k=>rows.every(r=>typeof r[k]==='number'&&Number.isFinite(r[k]))?rows.reduce((n,r)=>n+r[k],0):null;
 return {scope:'this_request',usagePlanPolicy:'free',calls:rows.reduce((n,r)=>n+r.calls,0),failedCalls:rows.filter(r=>r.failed).reduce((n,r)=>n+r.calls,0),inputTokens:total('inputTokens'),outputTokens:total('outputTokens'),providerElapsedMs:total('elapsedMs'),estimatedUsd:total('estimatedUsd'),chargedUsd:null,estimateMeaning:'paid_list_price_equivalent_not_invoice',models:[...new Set(rows.map(r=>r.model))]};
}
module.exports={PRICES,measure,logger,meteredProvider,summarize};
