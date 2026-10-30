'use strict';
// Isolated, read-only artifact registry; no database or provider fallback.
const C=require('./contracts'),E=require('./local-engine');
function create(envelopes){
 if(!Array.isArray(envelopes))throw Error('completed_registry_required');
 const rows=structuredClone(envelopes),seen=new Set();
 for(const row of rows){
  const a=row?.artifact;if(typeof row?.owner!=='string'||!row.owner||!a||a.status!=='ready'||a.version!==E.ENGINE_VERSION||!C.review(C.source(a.source),a.draft,a.review).ok)throw Error('completed_registry_invalid');
  const id=JSON.stringify([row.owner,a.key]);if(seen.has(id))throw Error('completed_registry_duplicate');seen.add(id);
 }
 return async function load({owner,key,sourceHash,version}){
  const row=rows.find(r=>r.owner===owner&&r.artifact.key===key&&r.artifact.version===version&&C.hash(C.source(r.artifact.source))===sourceHash);
  return row?structuredClone(row):null;
 };
}
module.exports={create};
