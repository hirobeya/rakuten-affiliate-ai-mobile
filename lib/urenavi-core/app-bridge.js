'use strict';
// Inert integration boundary: no route, provider, credentials, DB or cache writes.
// loadCompleted is a trusted server-side dependency, never an HTTP body value.
const C=require('./contracts'),E=require('./local-engine'),Legacy=require('../room-semantic-contract');
const identity=require('../../public/room-outcomes').identity;
function hold(code){throw Object.assign(Error(code),{code});}
function create({loadCompleted}){
 if(typeof loadCompleted!=='function')hold('completed_store_required');
 return async function read({environment,authorization,item,conditions={},admission=null}){
  if(environment!=='preview'||authorization?.ok!==true||authorization.plan!=='owner')hold('owner_preview_only');
  const owner=String(authorization.user?.id||authorization.user?.email||'').trim();
  if(!owner)hold('account_identity_required');
  const source=C.source(item),productIdentity=identity(source),sourceHash=C.hash(source);
  const key=C.hash({sourceHash,model:C.MODEL,version:E.ENGINE_VERSION,conditions,admission,safety:'existing-veto+strict-plan-v1'});
  const envelope=await loadCompleted({owner,productIdentity,sourceHash,key,version:E.ENGINE_VERSION});
  if(!envelope)return null;
  if(envelope.owner!==owner||!envelope.artifact)hold('completed_owner_mismatch');
  // Clone at the trusted boundary; no mutation of historical evidence/cache.
  const result=structuredClone(envelope.artifact);
  if(result.key!==key||result.version!==E.ENGINE_VERSION||C.hash(C.source(result.source))!==sourceHash||result.status!=='ready')hold('completed_cache_mismatch');
  if(C.hash(result.conditions)!==C.hash(conditions)||C.hash(result.output)!==C.hash({product:result.draft?.product,sentences:result.draft?.sentences}))hold('completed_output_mismatch');
  if(!C.review(source,result.draft,result.review).ok)hold('core_review_required');
  const quality=Legacy.publication(source,result.draft,result.review.legacy);
  if(quality.status!=='ready')hold('legacy_publication_required');
  const projected={version:'room_contract_rebuild_bridge_v1',ok:true,pending:false,model:C.MODEL,product:result.output.product,sentences:result.output.sentences,quality,variants:[{text:quality.text}],resourceUsage:{calls:0}};
  // The existing browser's exact-text gate must accept the final publication.
  if(require('../../public/room-copy-result').ready(projected)!==quality.text)hold('browser_publication_mismatch');
  return projected;
 };
}
module.exports={create};
