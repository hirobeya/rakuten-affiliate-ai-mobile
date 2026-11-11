'use strict';
// Offline preparation ONLY. No live switch, credential lookup, provider or audit writes.
const {prepareFallback}=require('../../lib/room-writer-raw/route');
const sourceSet=require('../../tests/room-writer/eval-set.json');
(async()=>{
 if(process.argv.slice(2).length)throw Error('offline_only_no_live_arguments');
 const rows=[];
 for(const row of sourceSet.historical.entries){
  const prepared=await prepareFallback({item:{catchcopy:'',...row.item}}),b=prepared.bundle;
  rows.push({itemCode:row.itemCode,status:prepared.status,qualityState:prepared.qualityState||'unverified',reason:prepared.reason||prepared.quality?.reason||null,groqCalls:0,sourceHash:b?.envelope?.sourceHash||prepared.quality?.sourceHash||null,inputHash:b?.inputHash||null,requestHash:b?.requestHash||null,reservation:b?.reservation||null,capacityUnknown:true});
 }
 process.stdout.write(JSON.stringify({route:'raw-source-fallback-v1',mode:'offline_only',groqCalls:0,newLiveApprovalRequired:true,dataset:'frozen historical fixture inputs; preservation does not independently certify source provenance',rows},null,2)+'\n');
})().catch(()=>{process.stderr.write('raw_source_offline_preparation_failed\n');process.exitCode=1;});
