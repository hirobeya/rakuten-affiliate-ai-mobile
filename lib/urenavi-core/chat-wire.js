'use strict';
// Wire preparation and response validation ONLY. No HTTP client, credentials, retries or DB.
const C=require('./contracts'),B=require('./capacity-analysis');
const ENDPOINT='https://api.groq.com/openai/v1/chat/completions';
function failure(code){const e=new Error(code);e.code=code;throw e;}
function compileRequest(req){
 if(req.model!==C.MODEL||req.max_tokens!==C.MAX_OUTPUT||req.reasoning_effort!=='medium'||req.messages?.length!==2||req.messages[0].role!=='system'||req.messages[1].role!=='user'||req.messages.some(m=>typeof m.content!=='string')||req.response_format?.type!=='json_schema'||req.response_format.json_schema?.strict!==true)failure('wire_request_contract');
 const body=structuredClone(req);delete body.max_tokens;body.max_completion_tokens=C.MAX_OUTPUT;
 return {url:ENDPOINT,method:'POST',body,serializedBody:JSON.stringify(body)};
}
function compileCalibration1000(req){
 const wire=compileRequest(req);
 if(C.hash(wire.body)!=='ab9f962665d02755d3e2fc683969472466e2da2964e7ce0cb7a13aa3d872d053')failure('calibration_wire_mismatch');
 wire.body.max_completion_tokens=1000;wire.serializedBody=JSON.stringify(wire.body);return wire;
}
function decodeResponse({status,body},stage,outputLimit=C.MAX_OUTPUT){
 if(![1000,C.MAX_OUTPUT].includes(outputLimit))failure('output_limit_unknown');
 if(status===429)failure('provider_429');if(status!==200)failure('provider_http_error');
 if(!body||body.model!==C.MODEL||body.choices?.length!==1)failure('response_unknown');
 const c=body.choices[0],m=c.message,u=body.usage;
 if(c.finish_reason!=='stop')failure('output_incomplete');
 if(!m||m.role!=='assistant'||m.refusal||m.tool_calls||typeof m.content!=='string')failure('response_unknown');
 if(!u||!['prompt_tokens','completion_tokens','total_tokens'].every(k=>Number.isSafeInteger(u[k])&&u[k]>=0)||u.prompt_tokens+u.completion_tokens!==u.total_tokens)failure('usage_unknown');
 if(u.completion_tokens>outputLimit)failure('usage_exceeded_reservation');
 let raw;try{raw=JSON.parse(m.content);}catch{failure('invalid_structured_json');}
 if(!['draft','review','rewrite','rereview'].includes(stage))failure('stage_unknown');
 if(['draft','rewrite'].includes(stage)&&Buffer.byteLength(JSON.stringify(raw))>B.candidateLimit())failure('candidate_storage_envelope_exceeded');
 return {status,raw,usage:{prompt_tokens:u.prompt_tokens,completion_tokens:u.completion_tokens,total_tokens:u.total_tokens},finish_reason:c.finish_reason};
}
module.exports={ENDPOINT,compileRequest,compileCalibration1000,decodeResponse};
