'use strict';
// Pure evidence compiler for the Free one-shot ONLY. No provider probe, unlock,
// generator, clock-based settlement, or claim creation. Administrator attestations
// remain necessary for callers that do not participate in the comparison store.
const C=require('./contracts'),R=require('./failed-calibration-reconciliation');
const KIND='exclusive-ledger-window-v1',CALLERS=['production','preview','actions','local-cli','other-playground'];
const MINUTE=60000,DAY=86400000;
const nat=x=>Number.isSafeInteger(x)&&x>=0;
const ref=x=>typeof x==='string'&&!!x.trim()&&x.length<=1024;
function fail(){throw Error('exclusive_ledger_evidence_unverified');}
function compile({proof:p,isolation:i,account:a,receipt,now}){
 const e=p?.ledger;
 if(p?.kind!==KIND||!nat(now)||!e||e.completeOrganizationInventory!==true||e.allCallersReconciled!==true||e.unresolvedRequests!==0||e.unresolvedReservations!==0||!ref(e.reference)||!ref(e.confirmedBy)||!ref(e.pendingCheckReference)||!nat(e.coverageStart)||e.coverageStart>Math.max(0,now-DAY)||!nat(e.coverageEnd)||e.coverageEnd>now||e.coverageStart>e.coverageEnd||!nat(e.reconciledAt)||e.reconciledAt<e.coverageEnd||e.reconciledAt>now||!Array.isArray(e.requests)||!Array.isArray(e.retainedHolds)||e.requests.length>1000||e.retainedHolds.length>1000)fail();
 if(!i||i.allCallersPaused!==true||i.holdUntilReconciled!==true||!ref(i.confirmedBy)||!nat(i.observedAt)||i.observedAt<e.reconciledAt||i.observedAt>now||now-i.observedAt>=MINUTE||!nat(i.exclusiveUntil)||i.exclusiveUntil<=now||!nat(i.windowStartedAt)||i.windowStartedAt>e.coverageEnd||i.noSendsSinceWindowStart!==true||i.receiptHash!==C.hash(receipt))fail();
 for(const k of CALLERS){const x=i.callers?.[k];if(x?.paused!==true||!ref(x.evidence)||!nat(x.pausedSince)||x.pausedSince>i.windowStartedAt||!ref(e.callerReferences?.[k]))fail();}
 if(a?.organization!=='Personal'||a.projectName!=='Default Project'||a.plan!=='Free'||a.day!==new Date(now).toISOString().slice(0,10)||a.otherWindowTokens!==0||a.otherWindowRequests!==0||a.project?.otherWindowTokens!==0||a.project?.otherWindowRequests!==0)fail();
 const ids=new Set(),components=[];let lastTerminal=i.windowStartedAt,foundOld=false;
 for(const x of e.requests){
  const u=x?.usage;
  if(!x||!/^req_[A-Za-z0-9_-]{1,128}$/.test(x.requestId||'')||ids.has(x.requestId)||!CALLERS.includes(x.caller)||!ref(x.reference)||x.terminalResponseConfirmed!==true||!nat(x.httpStatus)||x.httpStatus<200||x.httpStatus>599||x.httpStatus===429||!nat(x.sentAt)||x.sentAt>i.windowStartedAt||!nat(x.completedAt)||x.completedAt<x.sentAt||x.completedAt>e.reconciledAt||!u||!['prompt_tokens','completion_tokens','total_tokens'].every(k=>nat(u[k]))||u.prompt_tokens+u.completion_tokens!==u.total_tokens||u.total_tokens>8000)fail();
  ids.add(x.requestId);lastTerminal=Math.max(lastTerminal,x.completedAt);
  if(x.requestId===R.REQUEST_ID){
   if(foundOld||x.httpStatus!==400||C.hash(u)!==C.hash(receipt.reportedUsage)||x.sentAt!==receipt.providerEvidence.requestedAt||x.completedAt<receipt.providerEvidence.observedAt)fail();
   foundOld=true; // All old3729 is covered by the immutable retained6000, once.
  }else{
   if(x.requestId===receipt.attemptId)fail();
   components.push({id:x.requestId,tokens:u.total_tokens,requests:1});
  }
 }
 if(!foundOld||now-lastTerminal<MINUTE)fail();
 for(const h of e.retainedHolds){
  if(!h||h.kind!=='retained-budget-hold'||!ref(h.id)||ids.has(h.id)||h.id===receipt.attemptId||!ref(h.reference)||!nat(h.tokens)||!nat(h.requests)||h.tokens===0)fail();
  ids.add(h.id);components.push({id:h.id,tokens:h.tokens,requests:h.requests});
 }
 let tokens=0,requests=0;for(const x of components){tokens+=x.tokens;requests+=x.requests;if(!nat(tokens)||!nat(requests))fail();}
 for(const policy of [a,a.project])if(!policy||policy.otherTokens!==tokens||policy.otherRequests!==requests||policy.tpm!==8000||policy.rpm!==30||policy.dailyTokens!==200000||policy.dailyRequests!==1000)fail();
 // Conservative local reservation headroom, NOT a measured provider counter.
 // Full known inventory + completed responses + an attested continuous idle
 // window are required; elapsed time/empty delayed Usage alone cannot enter here.
 const budget={otherDailyComponents:components,minuteRemainingTokens:8000,minuteRemainingRequests:30,dayRemainingTokens:Math.max(0,200000-tokens-receipt.retainedDailyEncumbrance),dayRemainingRequests:Math.max(0,1000-requests-receipt.requestCharge)};
 const basis={kind:KIND,providerRemainingObserved:false,providerResetObserved:false,headroomKind:'conservative-local-reservation-budget',ledgerHash:C.hash(e),isolationHash:C.hash(i),lastTerminal,quietWindowMs:now-lastTerminal,coverageStart:e.coverageStart,coverageEnd:e.coverageEnd,reconciledAt:e.reconciledAt,callerReferenceHashes:Object.fromEntries(CALLERS.map(k=>[k,C.hash({audit:e.callerReferences[k],pause:i.callers[k].evidence,pausedSince:i.callers[k].pausedSince})])),requestAudit:e.requests.map(x=>({requestId:x.requestId,caller:x.caller,httpStatus:x.httpStatus,sentAt:x.sentAt,completedAt:x.completedAt,usage:{prompt_tokens:x.usage.prompt_tokens,completion_tokens:x.usage.completion_tokens,total_tokens:x.usage.total_tokens},referenceHash:C.hash(x.reference)})),retainedHolds:components.filter(x=>e.retainedHolds.some(h=>h.id===x.id))};
 return {organizationName:a.organization,projectName:a.projectName,model:C.MODEL,plan:'Free',receiptHash:C.hash(receipt),scope:'organization-and-project-all-callers',unresolvedRequests:0,unresolvedReservations:0,excludedAccountedRequestId:R.REQUEST_ID,source:'derived-exclusive-ledger-budget',reference:e.reference,confirmedBy:e.confirmedBy,resetEvidence:'documented-per-minute-limit; terminal inventory plus continuous exclusive idle window; NOT observed provider reset',pendingCheckReference:e.pendingCheckReference,dataAsOf:i.observedAt,observedAt:i.observedAt,maxReportingLagMs:0,validUntil:Math.min(p.validUntil,a.validUntil,i.exclusiveUntil),organization:structuredClone(budget),project:structuredClone(budget),basis};
}
module.exports={KIND,CALLERS,compile};
