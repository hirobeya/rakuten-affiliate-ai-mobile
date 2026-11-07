'use strict';
// Shared API -> single permanent claim -> EXISTING runner handoff.
const P=require('./comparison-policy'),D=require('./comparison-diagnostics'),Resume=require('./comparison-resume');
async function dispatch({store,comparisonRun,snapshot,evidence,facts,options,clock,liveAuthorization,runtimeMode='live',directory=P.STATE_DIRECTORY,http,nonInferenceProbe=null,onStage=()=>{},resumeContext=null}){
 let stage=resumeContext?'resume_acquire':'claim_write',attempt=null,executionResume=resumeContext;
 try{
  onStage(stage);if(resumeContext){attempt=await store.acquireResume(resumeContext,snapshot,clock());stage='resume_handoff';const handoff=await store.resumeHandoff(attempt,clock());executionResume=Resume.activate(resumeContext,attempt,handoff);}else await store.claim(snapshot,evidence,{capacityBasis:facts.capacityBasis});
  onStage('claim_confirmed');stage='runner_start';onStage(stage);
  const result=await comparisonRun({directory,snapshot,...evidence,...options,runtimeMode,liveAuthorization,clock,save:store.save,transportSave:store.save,...(http?{http}:{}),nonInferenceProbe,resumeContext:executionResume});
  if(attempt)await store.resumeTerminal(attempt,{status:result.status},clock());return result;
 }catch(e){if(attempt)try{await store.resumeTerminal(attempt,{status:'stopped_do_not_retry',diagnostic:D.summary(e,stage)},clock());}catch{}throw D.attach(e,stage);}
}
module.exports={dispatch};
