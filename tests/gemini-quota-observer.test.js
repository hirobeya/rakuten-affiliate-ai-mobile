'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {pacificDay,knownUsage,inspectModel,observe,MODEL}=require('../lib/room-writer-raw/gemini-quota-observer');
test('quota day uses Pacific time and never guesses unknown Google remaining',()=>{
 assert.equal(pacificDay(Date.parse('2026-11-19T07:59:59Z')),'2026-11-18');
 assert.equal(pacificDay(Date.parse('2026-11-19T08:00:00Z')),'2026-11-19');
 const x=knownUsage({timestamp:Date.parse('2026-11-19T08:00:00Z')});
 assert.equal(x.trackedAttemptsTotal,4);
 assert.equal(x.googleRemaining,null);
 assert.equal(x.googleRemainingTokens,null);
 assert.equal(x.dayAssignmentComplete,false,'JST-only past records cannot be silently assigned to Pacific days');
 assert.equal(x.limitSource,'historical_not_current');
});
test('model availability probe never performs generation or reports Free quota availability',async()=>{
 let calls=0;const observed=await observe({apiKey:'test-only-key',clock:()=>Date.parse('2026-11-19T09:00:00Z'),fetchImpl:async(url,options)=>{
  calls++;assert.equal(options.method,'GET');assert.match(url,/\/v1beta\/models\/gemini-3\.8-flash$/);
  assert.equal(options.headers['x-goog-api-key'],'test-only-key');
  return {ok:true,status:200,json:async()=>({name:'models/'+MODEL,supportedGenerationMethods:['generateContent','countTokens'],secret:'do-not-leak'})};
 }});
 assert.equal(calls,1);assert.equal(observed.modelCheck.status,'model_available');
 assert.equal(observed.modelCheck.generationCalls,0);assert.equal(observed.providerGenerationCalls,0);
 assert.equal(observed.canAuthorizeGeneration,false);
 assert.equal(observed.officialCurrentLimitsVerified,false);
 assert.equal(observed.exactRemaining,null);
 assert.equal(JSON.stringify(observed).includes('do-not-leak'),false);
 assert.equal(JSON.stringify(observed).includes('test-only-key'),false);
});
test('model errors and missing key remain fail-closed without any retry',async()=>{
 for(const status of [403,429,503]){
  let calls=0;
  const result=await inspectModel({apiKey:'mock-only',fetchImpl:async()=>{calls++;return {ok:false,status};}});
  assert.equal(calls,1);
  assert.equal(result.available,null);
  assert.equal(result.generationCalls,0);
 }
 const noKey=await inspectModel({apiKey:''});
 assert.equal(noKey.status,'key_missing');
 assert.equal(noKey.probeCalls,0);
});


test('current independently claimed attempt is counted once from durable state, not from browser or Google guessed remaining',async()=>{
 const at=Date.parse('2026-11-19T10:20:00Z'),status=knownUsage({
  timestamp:at,currentAttempt:{claim:{at:'2026-11-19T09:00:00Z'},dispatch:{at:'2026-11-19T09:00:00Z'},approvalClaim:{}}});
 assert.equal(status.trackedAttemptsTotal,5);
 assert.equal(status.trackedAttemptsToday,1);
 assert.equal(status.currentAttemptClaimed,true);
 assert.equal(status.googleRemaining,null);
 let calls=0;
 const o=await observe({clock:()=>at,apiKey:'fake',loadCurrentAttempt:async()=>({claim:{at:'2026-11-19T09:00:00Z'}}),
  fetchImpl:async()=>{calls++;return {ok:true,status:200,json:async()=>({name:'models/gemini-3.8-flash',supportedGenerationMethods:['generateContent']})};}});
 assert.equal(o.ledgerRead,'ok');
 assert.equal(o.usage.trackedAttemptsTotal,5);
 assert.equal(o.providerGenerationCalls,0);
 assert.equal(o.canAuthorizeGeneration,false);
 assert.equal(calls,1);
});
test('unreadable ledger never becomes zero verified usage',async()=>{
 const o=await observe({apiKey:'fake',loadCurrentAttempt:async()=>{throw Error('blob unavailable');},
 fetchImpl:async()=>({ok:false,status:503})});
 assert.equal(o.ledgerRead,'unavailable');
 assert.equal(o.usage.googleRemaining,null);
 assert.equal(o.modelCheck.available,null);
 assert.equal(o.canAuthorizeGeneration,false);
});
