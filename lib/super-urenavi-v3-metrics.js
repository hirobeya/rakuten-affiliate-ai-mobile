'use strict';

const ROUTES=new Set(['cache','local','text','image','fallback','unknown']);

function canonicalRoute(route='',input={}){
  const raw=String(route||'').trim();
  if(ROUTES.has(raw)) return raw;
  const textCalls=int(input.pass1Calls)+int(input.pass2Calls);
  if(raw==='pass1'||raw==='pass1+pass2'||raw==='cache+pass2') return 'text';
  if(raw==='cache_pending'||raw==='cache_partial'||raw==='cache_hit'||raw==='cache') return textCalls>0?'text':'cache';
  return 'unknown';
}
const TIERS=new Set(['A','B','C','none','unknown']);
const HOOKS=new Set(['question','relatable','failure_avoidance','number','scene','none','unknown']);

function int(value){
  const n=Number(value);
  return Number.isInteger(n)&&n>=0?n:0;
}

function text(value,max=120){
  return String(value??'').trim().slice(0,max);
}

function buildAiUsageMetric(input={}){
  const route=canonicalRoute(input.route,input);
  const tier=TIERS.has(input.outputTier)?input.outputTier:'unknown';
  const hookType=HOOKS.has(input.hookType)?input.hookType:'unknown';
  return {
    schema:'super_urenavi_v3_usage_v1',
    route,
    pass1Calls:int(input.pass1Calls),
    pass2Calls:int(input.pass2Calls),
    imageCalls:int(input.imageCalls),
    totalGroqCalls:int(input.pass1Calls)+int(input.pass2Calls)+int(input.imageCalls),
    cacheStatus:text(input.cacheStatus||'unknown',40)||'unknown',
    outputTier:tier,
    hookType,
    decisionAxis:text(input.decisionAxis||'',80),
    machineValidationPassed:input.machineValidationPassed===true,
    copied:input.copied===true?true:input.copied===false?false:null,
    elapsedMs:int(input.elapsedMs)
  };
}

function logAiUsageMetric(input={}){
  const payload=buildAiUsageMetric(input);
  console.log('urenavi v3 usage',JSON.stringify(payload));
  return payload;
}

module.exports={canonicalRoute,buildAiUsageMetric,logAiUsageMetric};
