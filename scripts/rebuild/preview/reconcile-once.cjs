'use strict';
// Reviewed deployment-time operation: private Blob reads + one create-only receipt. No Groq module or HTTP transport.
const C=require('../../../lib/urenavi-core/contracts'),R=require('../../../lib/urenavi-core/failed-calibration-reconciliation'),P=require('./persistence');
const observation=require('../../../docs/rebuild-20261028/p3-reconciliation-20261106/provider-observation.json');
const baseline=require('../../../docs/rebuild-20261028/p3-first-live-20261106/journals-readback.json').journals;
async function reconcileOnce({env=process.env,blob}){
 if(env.VERCEL_ENV!=='preview'||env.VERCEL_GIT_COMMIT_REF!=='rebuild/urenavi-core-20261028'||env.URENAVI_CALIBRATION_LIVE==='approved-one-call')throw Error('disarmed_isolated_preview_required');
 const p=P.create(blob),fresh=await p.inspect();
 // This deployment must match the exact old evidence before any new write.
 if(C.hash(fresh)!==C.hash(baseline))throw Error('original_journals_changed_hold');
 const expected=R.createReceipt(fresh,observation.evidence);
 const key=P.PREFIX+'/reconciliation-v1.json',existing=await blob.get(key,{access:'private',useCache:false});
 let created=false;
 if(existing){
  if(existing.statusCode!==200||!existing.stream)throw Error('receipt_read_failed_hold');
  const receipt=JSON.parse(await new Response(existing.stream).text());R.verifyReceipt(receipt,fresh);
  if(C.hash(receipt)!==C.hash(expected))throw Error('receipt_changed_hold');
 }else{await p.recordReconciliation(observation.evidence);created=true;}
 const after=await p.inspect();if(C.hash(after)!==C.hash(fresh))throw Error('original_journals_changed_hold');
 return {status:'private_reconciliation_verified',receiptCreated:created,receiptHash:C.hash(expected),originalJournalsHash:C.hash(fresh),originalsPreserved:true,retainedReservation:6000,holdReleased:0,inferenceCalls:0,sendPermission:false};
}
module.exports={reconcileOnce};
if(require.main===module)reconcileOnce({blob:require('@vercel/blob')}).then(result=>process.stdout.write(JSON.stringify(result)+'\n')).catch(()=>{process.stderr.write('private_reconciliation_not_verified_no_inference_or_release\n');process.exitCode=1;});
