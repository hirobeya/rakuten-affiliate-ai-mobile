'use strict';

const assert=require('node:assert/strict');
const {buildAiUsageMetric,logAiUsageMetric}=require('../lib/super-urenavi-v3-metrics');

const metric=buildAiUsageMetric({
  route:'text',pass1Calls:1,pass2Calls:1,imageCalls:0,
  cacheStatus:'miss',outputTier:'A',hookType:'question',
  decisionAxis:'size',machineValidationPassed:true,copied:false,elapsedMs:321
});
assert.equal(metric.schema,'super_urenavi_v3_usage_v1');
assert.equal(metric.route,'text');
assert.equal(metric.pass1Calls,1);
assert.equal(metric.pass2Calls,1);
assert.equal(metric.imageCalls,0);
assert.equal(metric.totalGroqCalls,2);
assert.equal(metric.outputTier,'A');
assert.equal(metric.hookType,'question');
assert.equal(metric.machineValidationPassed,true);
assert.equal(metric.copied,false);

const safe=buildAiUsageMetric({route:'bogus',pass1Calls:-2,pass2Calls:'x',imageCalls:3.2});
assert.equal(safe.route,'unknown');
assert.equal(safe.pass1Calls,0);
assert.equal(safe.pass2Calls,0);
assert.equal(safe.imageCalls,0);
assert.equal(safe.totalGroqCalls,0);

const original=console.log;
const rows=[];
console.log=(...args)=>rows.push(args);
try{
  const logged=logAiUsageMetric({route:'cache',outputTier:'B'});
  assert.equal(logged.route,'cache');
  assert.equal(rows.length,1);
  assert.equal(rows[0][0],'urenavi v3 usage');
  const payload=JSON.parse(rows[0][1]);
  assert.equal(payload.schema,'super_urenavi_v3_usage_v1');
  assert.equal(payload.totalGroqCalls,0);
}finally{
  console.log=original;
}

console.log('super-urenavi-v3-metrics.test.js: PASS');
