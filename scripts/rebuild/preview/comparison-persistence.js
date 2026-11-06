'use strict';
// Only the fixed comparison namespace is writable; old evidence is read-only.
const fs=require('node:fs'),path=require('node:path'),C=require('../../../lib/urenavi-core/contracts'),CP=require('../../../lib/urenavi-core/comparison-policy'),R=require('../../../lib/urenavi-core/failed-calibration-reconciliation'),Old=require('./persistence');
function fail(){throw Error('comparison_persistence_hold');}
function create(blob,{directory=CP.STATE_DIRECTORY}={}){
 const versions=new Map();
 async function read(name){const r=await blob.get(name,{access:'private',useCache:false});if(!r||r.statusCode!==200||!r.stream)fail();return {value:JSON.parse(await new Response(r.stream).text()),etag:r.blob?.etag};}
 async function put(name,value,overwrite=false){const etag=overwrite?versions.get(name):null;const r=await blob.put(name,JSON.stringify(value),{access:'private',addRandomSuffix:false,allowOverwrite:!!etag,...(etag?{ifMatch:etag}:{}),contentType:'application/json',cacheControlMaxAge:60});const confirmed=await read(name);if(typeof r.etag!=='string'||confirmed.etag!==r.etag||C.hash(confirmed.value)!==C.hash(value))fail();versions.set(name,r.etag);}
 async function prior(){const journals=await Old.create(blob).inspect();const {value:receipt}=await read(Old.PREFIX+'/reconciliation-v1.json');R.verifyReceipt(receipt,journals);return {prior:journals,receipt};}
 async function claim(snapshot,evidence){
  if(snapshot?.grant?.experimentId!==CP.EXPERIMENT_ID||snapshot.grant.wireHash!==CP.WIRE_HASH||C.hash(evidence.receipt)!==snapshot.grant.receiptHash)fail();
  const current=await prior();if(C.hash(current)!==C.hash(evidence))fail();
  await put(CP.PREFIX+'/claimed.json',{version:1,experimentId:CP.EXPERIMENT_ID,wireHash:CP.WIRE_HASH,snapshotHash:C.hash(snapshot),evidenceHashes:Object.fromEntries(['grant','inputProof','capacityProof','isolation'].map(k=>[k,C.hash(snapshot[k])])),verifiedInputUpper:snapshot.inputProof?.upperTokens,reservationInput:5000,reservationOutput:3000,receiptHash:C.hash(current.receipt),reservation:8000,state:'claimed_hold',publication:false});
 }
 async function save(file,value){const relative=path.relative(directory,file);if(!['calibration.json',path.join('http','transport.json')].includes(relative))fail();await put(CP.PREFIX+'/'+relative.split(path.sep).join('/'),value,true);fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});const tmp=file+'.tmp',fd=fs.openSync(tmp,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(tmp,file);}
 async function inspect(){const result={};for(const [key,file]of [['claim','claimed.json'],['calibration','calibration.json'],['transport','http/transport.json']]){const r=await blob.get(CP.PREFIX+'/'+file,{access:'private',useCache:false});if(!r){result[key]={exists:false};continue;}if(r.statusCode!==200||!r.stream)fail();result[key]={exists:true,value:JSON.parse(await new Response(r.stream).text())};}return result;}
 return {prior,claim,save,inspect};
}
module.exports={create};
