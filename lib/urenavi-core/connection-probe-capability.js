'use strict';
// Only this factory can mint a non-inference capability. Its HTTP implementation
// is a closed fixture, not an injectable network client. JSON cannot forge it.
const path=require('node:path'),os=require('node:os'),C=require('./contracts');
const caps=new WeakSet();
function create(id,scenario='success'){
 if(!/^[a-f0-9]{32}$/.test(id||'')||!['success','400','429','timeout','save-failure','duplicate','concurrent','audit-failure','http-save-failure'].includes(scenario))throw Error('invalid_connection_probe');
 let calls=0;const directory=path.join(os.tmpdir(),'urenavi-connection-probe-'+id);
 const http=async(url,options)=>{calls++;if(url!=='https://api.groq.com/openai/v1/chat/completions'||options.headers.Authorization!==undefined||C.hash(JSON.parse(options.body))!=='ab9f962665d02755d3e2fc683969472466e2da2964e7ce0cb7a13aa3d872d053')throw Error('invalid_probe_wire');
  if(scenario==='timeout')return new Promise(()=>{});const status=scenario==='400'?400:scenario==='429'?429:200;
  return {status,headers:{get:k=>k==='x-request-id'?'req_synthetic_connection_probe':null},json:async()=>status===200?{model:C.MODEL,choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(require('../../tests/rebuild/fixture.cjs').fixture().draft)}}],usage:{prompt_tokens:2729,completion_tokens:1000,total_tokens:3729}}:{error:{code:'json_validate_failed'},usage:{prompt_tokens:2729,completion_tokens:3000,total_tokens:5729}}};};
 const cap=Object.freeze({id,scenario,directory,http,calls:()=>calls});caps.add(cap);return cap;
}
function valid(cap,directory,http){return !!cap&&caps.has(cap)&&cap.directory===directory&&cap.http===http;}
module.exports={create,valid};
