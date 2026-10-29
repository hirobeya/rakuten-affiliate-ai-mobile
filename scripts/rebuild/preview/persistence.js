'use strict';
const fs=require('node:fs'),path=require('node:path'),C=require('../../../lib/urenavi-core/contracts'),L=require('../../../lib/urenavi-core/live-calibration');
const PREFIX='urenavi-first-call/'+L.WIRE_HASH;
function fail(){throw Error('durable_calibration_hold');}
function atomic(file,value){
 fs.mkdirSync(path.dirname(file),{recursive:true,mode:0o700});
 const f=file+'.tmp',fd=fs.openSync(f,'w',0o600);try{fs.writeFileSync(fd,JSON.stringify(value));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}
 fs.renameSync(f,file);
}
function create(blob,{directory=L.STATE_DIRECTORY}={}){
 const versions=new Map();
 async function read(name){const r=await blob.get(name,{access:'private',useCache:false});if(!r||r.statusCode!==200||!r.stream)fail();return {value:JSON.parse(await new Response(r.stream).text()),etag:r.blob?.etag};}
 async function put(name,value,overwrite=false){
  // A stable create-only pathname provides the permanent global one-shot claim.
  const etag=overwrite?versions.get(name):null;
  const result=await blob.put(name,JSON.stringify(value),{access:'private',addRandomSuffix:false,allowOverwrite:!!etag,...(etag?{ifMatch:etag}:{}),contentType:'application/json',cacheControlMaxAge:60});
  const confirmed=await read(name);if(typeof result.etag!=='string'||confirmed.etag!==result.etag||C.hash(confirmed.value)!==C.hash(value))fail();
  versions.set(name,result.etag);
 }
 async function claim(snapshot){await put(PREFIX+'/claimed.json',{version:1,wireHash:L.WIRE_HASH,snapshotHash:C.hash(snapshot),state:'claimed_hold',publication:false});}
 async function save(file,value){
  const relative=path.relative(directory,file);
  if(!['calibration.json',path.join('http','transport.json')].includes(relative))fail();
  await put(PREFIX+'/'+relative.split(path.sep).join('/'),value,true);
  atomic(file,value); // Local mirror is used only after remote persistence and uncached read-back.
 }
 async function probe(id){
  if(typeof id!=='string'||!/^[a-f0-9]{32}$/.test(id))fail();
  const name='urenavi-probes/'+id+'/claim.json';
  await put(name,{version:1,probe:id,purpose:'storage-only-no-inference'});
  return {persistent:true,createOnly:true,readBack:true,probe:id};
 }
 return {claim,save,probe};
}
module.exports={create,PREFIX};
