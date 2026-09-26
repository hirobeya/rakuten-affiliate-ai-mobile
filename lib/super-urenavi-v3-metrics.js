'use strict';

const ROUTES=new Set(['cache','local','text','image','fallback','unknown']);
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
  const route=ROUTES.has(input.route)?input.route:'unknown';
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

module.exports={buildAiUsageMetric,logAiUsageMetric};
