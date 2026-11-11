
'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {initialProbeBudget}=require('../../lib/room-writer/initial-probe');
const {onResponse,budget}=require('../../lib/room-writer/budget');
const input={approved:true,priorAttempts:0,inputEstimate:3061,outputReserve:2000};
test('initial experiment exception never manufactures remaining capacity',()=>{
 const v=initialProbeBudget(input);assert.equal(v.allow,true);assert.equal(v.reserved,5061);assert.equal(v.remainingMinute,null);assert.equal(v.remainingDaily,null);
 assert.equal(budget({dayUsed:0,minuteUsed:0,inputEstimate:3061}).allow,false);
});
test('initial exception rejects repeat, absent permission, larger request or output',()=>{
 for(const change of [{priorAttempts:1},{approved:false},{inputEstimate:3062},{inputEstimate:null},{outputReserve:2001}])assert.equal(initialProbeBudget({...input,...change}).allow,false);
});
test('429, unknown usage and transport failure remain terminal',()=>{
 for(const [status,usage] of [[429,null],[200,null],[503,null]])assert.equal(onResponse(status,usage).stop,true);
});
