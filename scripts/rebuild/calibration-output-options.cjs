'use strict';
// Offline payload comparison only. No transport/runner authorization or token recounter.
const C=require('../../lib/urenavi-core/contracts');
const BASE_HASH='ab9f962665d02755d3e2fc683969472466e2da2964e7ce0cb7a13aa3d872d053';
function build(frozen){
 if(C.hash(frozen?.wire?.body)!==BASE_HASH||frozen.wire.body.max_completion_tokens!==3000)throw Error('frozen_wire_changed');
 return [1000,1500,2000].map(output=>{
  const body=structuredClone(frozen.wire.body);body.max_completion_tokens=output;
  const wire={url:frozen.wire.url,method:frozen.wire.method,body,serializedBody:JSON.stringify(body)};
  return {kind:'calibration-only-unsent',baseWireHash:BASE_HASH,wireHash:C.hash(body),wire,visibleComponentCount:2527,countProvenance:'inherited measured ordinary component sum, not provider input or upper bound',inputReservation:5000,inputReservationCertified:false,outputReservation:output,provisionalTotal:5000+output,assumedActualAccountTPM:8000,nominalHeadroomAgainstInputReservation:8000-5000-output,requiredProviderInputUpperAtFullIdleTPM:8000-output,permittedAdditionalToVisibleSum:8000-output-2527,providerAdditionalUpper:null,splitLimits:null,currentRemaining:null,normalGeneration:false,publishable:false,liveApproved:false,gate:'HOLD'};
 });
}
module.exports={build};
if(require.main===module){
 const fs=require('node:fs'),path=require('node:path');
 const frozen=require('../../docs/rebuild-20261028/p3-first-call-gate/first-call-plan.json');
 const out=path.resolve(__dirname,'../../docs/rebuild-20261028/p3-calibration-output-review');
 fs.writeFileSync(path.join(out,'options.json'),JSON.stringify(build(frozen),null,2)+'\n');
 console.log(JSON.stringify({variants:3,normalOutput:C.MAX_OUTPUT,liveApproved:false,inferenceCalls:0}));
}
