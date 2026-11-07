'use strict';
// Shared API -> single permanent claim -> EXISTING runner handoff.
const P=require('./comparison-policy'),D=require('./comparison-diagnostics');
async function dispatch({store,comparisonRun,snapshot,evidence,facts,options,clock,liveAuthorization,runtimeMode='live',directory=P.STATE_DIRECTORY,http,nonInferenceProbe=null,onStage=()=>{}}){
 let stage='claim_write';
 try{
  onStage(stage);await store.claim(snapshot,evidence,{capacityBasis:facts.capacityBasis});
  onStage('claim_confirmed');stage='runner_start';onStage(stage);
  return await comparisonRun({directory,snapshot,...evidence,...options,runtimeMode,liveAuthorization,clock,save:store.save,transportSave:store.save,...(http?{http}:{}),nonInferenceProbe});
 }catch(e){throw D.attach(e,stage);}
}
module.exports={dispatch};
