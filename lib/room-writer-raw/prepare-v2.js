'use strict';
// Offline-only preparation: v1 controls the local-first eligibility gate, but
// the v2 request contract is separately versioned and cannot enter v1 execute().
const {prepareFallback}=require('./route');
const V2=require('./contract-v2');
const {hash,freeze}=require('./source');

async function prepareV2(options){
 const prior=await prepareFallback(options);
 if(prior.status!=='fallback_prepared_not_authorized'){
  return {status:prior.status,qualityState:prior.qualityState||'unverified',calls:0,publication:false,copyable:false,reason:prior.reason||null};
 }
 const bundle=V2.build(prior.bundle.envelope);
 if(bundle.held)return {status:'held',reason:bundle.reason,calls:0,publication:false,copyable:false};
 return freeze({
  version:V2.CONTRACT_VERSION,
  status:'v2_offline_prepared_not_authorized',
  publication:false,copyable:false,calls:0,
  sourceHash:bundle.envelope.sourceHash,
  inputHash:bundle.inputHash,
  requestHash:bundle.requestHash,
  qualityHash:hash(prior.quality),
  inputEstimate:bundle.inputEstimate,
  reservation:bundle.reservation,
  request:bundle.request
 });
}
module.exports={prepareV2};
