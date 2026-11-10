'use strict';
const {createHash}=require('node:crypto');
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const hash=x=>createHash('sha256').update(JSON.stringify(canonical(x))).digest('hex');
const marker=x=>({at:x?.at,model:x?.model,reason:x?.reason});
function knownUsage(u){return Number.isSafeInteger(u?.inputTokens)&&u.inputTokens>=0&&Number.isSafeInteger(u?.outputTokens)&&u.outputTokens>=0&&u.totalTokens===u.inputTokens+u.outputTokens;}
function resolved(row){
 if(!row?.uncertain)return false;
 const matches=(Array.isArray(row.reconciliations)?row.reconciliations:[]).filter(r=>r.markerHash===hash(marker(row.uncertain)));
 if(matches.length!==1)return false;
 const {receiptHash,...receipt}=matches[0];
 return receiptHash===hash(receipt)&&receipt.kind==='provider_console_usage_v1'&&receipt.model===row.uncertain.model&&knownUsage(receipt.usage)&&receipt.refundTokens===0&&receipt.quotaRefund===0;
}
// Operator-only accounting helper. No HTTP/API handler and no provider calls.
// Original uncertainty, reservations, quota and rate state remain untouched.
function prepare(row,record,evidence,now=Date.now()){
 const deny=()=>{throw Error('reconciliation_evidence_mismatch');};
 if(row?.uncertain?.reason!=='usage_unknown'||row.lease||resolved(row))deny();
 const state=record?.raw_ai_json?.state,unknown=state?.calls?.filter(c=>c.usage===null);
 if(!state||state.stage!=='done'||state.quality?.status!=='blocked'||!Array.isArray(unknown)||unknown.length!==1||state.calls.at(-1)!==unknown[0]||unknown[0].error!=='invalid_structured_output')deny();
 const failed=unknown[0];
 if(!state.upstreamErrors?.some(e=>e.stage===failed.stage&&e.attempt===failed.attempt&&e.error?.status===400&&e.error?.code==='json_validate_failed'))deny();
 const requestedAt=Date.parse(evidence?.requestedAt);
 if(evidence?.source!=='authenticated_groq_console'||evidence.organization!=='Personal'||evidence.project!=='Default Project'||evidence.model!==row.uncertain.model||record.model!==evidence.model||evidence.httpStatus!==400||evidence.error!=='json_validate_failed'||evidence.matchingEntries!==1||!knownUsage(evidence.usage))deny();
 if(!Number.isFinite(requestedAt)||requestedAt<state.finishedAt-failed.elapsedMs-2000||requestedAt>state.finishedAt||row.uncertain.at<state.finishedAt||row.uncertain.at>state.finishedAt+15000||now<row.uncertain.at)deny();
 if(!Number.isSafeInteger(evidence.reservedTotal)||evidence.usage.totalTokens>evidence.reservedTotal||evidence.usage.outputTokens>3000||evidence.reservedTotal>8000||typeof record.cache_key!=='string'||!record.cache_key)deny();
 const receipt={kind:'provider_console_usage_v1',model:evidence.model,markerHash:hash(marker(row.uncertain)),recordHash:hash(record),cacheKey:record.cache_key,stage:failed.stage,attempt:failed.attempt,providerEvidence:evidence,usage:evidence.usage,recordedAt:now,refundTokens:0,quotaRefund:0};
 receipt.receiptHash=hash(receipt);
 return {...row,reconciliations:[...(row.reconciliations||[]),receipt]};
}
module.exports={hash,marker,knownUsage,resolved,prepare};
