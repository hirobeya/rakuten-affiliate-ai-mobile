'use strict';
// Policy for the single frozen experiment; never a general generation entrypoint.
const path=require('node:path'),os=require('node:os');
const WIRE_HASH='351242d9c86b14994760b18621496db1f195f9d1f657db6317bb40f3062648b4';
const ISOLATED_PREVIEW=process.env.VERCEL_ENV==='preview'&&process.env.URENAVI_CALIBRATION_ISOLATED_PREVIEW==='1';
const STATE_DIRECTORY=ISOLATED_PREVIEW?path.join(os.tmpdir(),'urenavi-frozen-calibration'):path.resolve(__dirname,'../../docs/rebuild-20261028/p3-first-live-state');
const CALLERS=['production','preview','actions','local-cli','other-playground'];
function fail(){throw Object.assign(Error('live_preconditions_unverified'),{code:'live_preconditions_unverified'});}
function validate({directory,wireHash,grant,evidence,account:a,isolation:i,now,calibrationProfile,liveAuthorization,mockAuthentication}){
 if(directory!==STATE_DIRECTORY||wireHash!==WIRE_HASH||calibrationProfile!=='first-call-1000'||typeof liveAuthorization!=='function'||mockAuthentication!==null)fail();
 if(!grant||grant.wireHash!==WIRE_HASH||grant.model!=='openai/gpt-oss-120b'||grant.maxRequests!==1||grant.stage!=='draft'||!Number.isSafeInteger(grant.expiresAt)||grant.expiresAt<=now||grant.mode!=='live-one-call'||grant.experimentKind!=='limited-calibration'||grant.uncertainConsumptionAccepted!==true||typeof grant.approvalReference!=='string'||!grant.approvalReference.trim())fail();
 if(!evidence||evidence.wireHash!==WIRE_HASH||evidence.kind!=='limited-experiment-estimate'||evidence.inputReservation!==5000||evidence.uncertaintyAcknowledged!==true||evidence.providerBoundCertified!==false)fail();
 if(!a||a.mode!=='live-calibration'||a.organization!=='Personal'||a.projectName!=='Default Project'||a.rpm!==30||a.tpm!==8000||a.dailyRequests!==1000||a.dailyTokens!==200000||!a.project)fail();
 if(a.project.rpm!==30||a.project.tpm!==8000||a.project.dailyRequests!==1000||a.project.dailyTokens!==200000)fail();
 const v=a.verification;
 if(!v||!Number.isSafeInteger(v.observedAt)||v.observedAt>now||!Number.isSafeInteger(a.validUntil)||a.validUntil<=now||a.validUntil<=v.observedAt||typeof v.confirmedBy!=='string'||!v.confirmedBy.trim()||typeof v.source!=='string'||!v.source.trim()||typeof v.resetDescription!=='string'||!v.resetDescription.trim()||v.unresolvedRequests!==0||v.unresolvedReservations!==0)fail();
 if(a.splitApplicability==='applicable'){
  if(!a.splitTokens||!['itpm','otpm','otherInput','otherOutput'].every(k=>Number.isSafeInteger(a.splitTokens[k])&&a.splitTokens[k]>=0))fail();
 }else if(a.splitApplicability!=='not-applicable'||a.splitTokens!=null)fail();
 if(!i||i.mode!=='live-calibration'||i.allCallersPaused!==true||typeof i.confirmedBy!=='string'||!i.confirmedBy.trim()||i.holdUntilReconciled!==true||!Number.isSafeInteger(i.observedAt)||i.observedAt>now||i.observedAt<v.observedAt||!Number.isSafeInteger(i.exclusiveUntil)||i.exclusiveUntil<=now||!i.callers)fail();
 if(CALLERS.some(k=>i.callers[k]?.paused!==true||typeof i.callers[k]?.evidence!=='string'||!i.callers[k].evidence.trim()))fail();
}
// Read the one runtime secret only when transport is about to send. Never serialize it.
function authorizationFromEnvironment(){
 const key=process.env.GROQ_API_KEY;
 if(typeof key!=='string'||!key||/\s/.test(key))throw Error('live_authentication_unavailable');
 return 'Bearer '+key;
}
module.exports={WIRE_HASH,STATE_DIRECTORY,CALLERS,validate,authorizationFromEnvironment};
