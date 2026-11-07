'use strict';
// Storage-only diagnostic. Never imports an execution adapter or invokes a
// runner/transport. The wrapper can write ONLY its independent probe prefix.
const C=require('../../../lib/urenavi-core/contracts'),CP=require('../../../lib/urenavi-core/comparison-policy'),Store=require('./comparison-persistence');
function assertDisarmed(env){if(env.VERCEL_ENV!=='preview'||env.VERCEL_GIT_COMMIT_REF!=='rebuild/urenavi-core-20261028'||['URENAVI_CALIBRATION_LIVE','URENAVI_COMPARISON_LIVE','URENAVI_FREE_CALIBRATION_LIVE'].some(k=>env[k]==='approved-one-call')||env.URENAVI_APPROVED_COMPARISON_GRANT)throw Error('disarmed_probe_required');}
const strong=x=>typeof x==='string'&&!x.startsWith('W/')?(x.startsWith('"')&&x.endsWith('"')?x.slice(1,-1):x):null;
async function probe({blob,env=process.env,id}){
 assertDisarmed(env);if(!/^[a-f0-9]{32}$/.test(id||''))throw Error('probe_id_required');
 const actual=Store.create(blob),before={...await actual.prior(),comparison:await actual.inspect()},prefix='urenavi-connection-probes/'+id,events=[],expected=new Map();
 function map(k){return k.startsWith(CP.PREFIX+'/')?prefix+k.slice(CP.PREFIX.length):k;}
 const isolated={async head(k){return blob.head(map(k));},async get(k,o){const key=map(k),r=await blob.get(key,o);if(r?.stream&&expected.has(key)){
   const [a,b]=r.stream.tee(),text=await new Response(b).text(),want=expected.get(key);let equal=false;try{equal=C.hash(JSON.parse(text))===C.hash(JSON.parse(want.body));}catch{}
   let head=null;try{if(typeof blob.head==='function')head=await blob.head(key);}catch{}
   events.push({stage:'claim_readback',readTagLength:typeof r.blob?.etag==='string'?r.blob.etag.length:null,readTagEmpty:r.blob?.etag==='',headTagPresent:typeof head?.etag==='string',headMatchesPut:head?.etag===want.etag,putTagPresent:typeof want.etag==='string',readTagPresent:typeof r.blob?.etag==='string',exactTagMatch:want.etag===r.blob?.etag,strongTagEquivalent:strong(want.etag)!==null&&strong(want.etag)===strong(r.blob?.etag),bodyHashMatches:equal,putTagQuoted:typeof want.etag==='string'&&want.etag.startsWith('"'),readTagQuoted:typeof r.blob?.etag==='string'&&r.blob.etag.startsWith('"')});return {...r,stream:a};}return r;},
  async put(k,body,o){const key=map(k);if(!key.startsWith(prefix+'/'))throw Error('probe_write_scope');const r=await blob.put(key,body,o);expected.set(key,{body,etag:r.etag});events.push({stage:'claim_put_returned',putTagPresent:typeof r.etag==='string'});return r;}};
 const store=Store.create(isolated),snapshot=structuredClone(require('../../../docs/rebuild-20261028/p3-free-calibration-ready-20261106/approval-pending.json').snapshot);snapshot.grant.receiptHash=C.hash(before.receipt);
 let confirmed=false;try{await store.claim(snapshot,{prior:before.prior,receipt:before.receipt});confirmed=true;}catch{events.push({stage:'claim_confirmation_rejected'});}
 const after={...await actual.prior(),comparison:await actual.inspect()};if(C.hash(before)!==C.hash(after))throw Error('protected_records_changed');
 return {status:'storage_roundtrip_observed',sourceSha:env.VERCEL_GIT_COMMIT_SHA,probePrefix:prefix,claimConfirmed:confirmed,events,protectedRecordsUnchanged:true,protectedRecordsHash:C.hash(before),existingClaim:before.comparison.claim.exists,existingClaimHash:before.comparison.claim.exists?C.hash(before.comparison.claim.value):null,existingClaimReservation:before.comparison.claim.value?.reservation??null,calibrationExists:before.comparison.calibration.exists,transportExists:before.comparison.transport.exists,inferenceCalls:0};
}
module.exports={probe,assertDisarmed};
if(require.main===module){const id=process.env.URENAVI_CONNECTION_PROBE_ID;if(!id)process.stdout.write(JSON.stringify({status:'storage_roundtrip_not_requested',inferenceCalls:0})+'\n');else probe({blob:require('@vercel/blob'),id}).then(r=>process.stdout.write(JSON.stringify(r)+'\n')).catch(()=>{process.stderr.write(JSON.stringify({status:'storage_roundtrip_hold',inferenceCalls:0})+'\n');process.exitCode=1;});}
