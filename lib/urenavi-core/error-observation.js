'use strict';
// Private diagnostics only. Never a publication result or a source of retry permission.
const C=require('./contracts');
const reasoning=/<\/?(?:think|analysis|reasoning)\b|<\|(?:analysis|channel|im_start)[^>]*>|["'](?:reasoning|analysis)["']\s*:|\b(?:chain.of.thought|reasoning_content)\b/i;
const blockedKey=/reasoning|analysis|authorization|password|secret|api.?key|cookie|access.?token/i;
function text(value,secrets,max=4096){
 if(typeof value!=='string')return null;
 if(reasoning.test(value))return '[omitted: reasoning]';
 let s=value;
 for(const key of secrets.filter(x=>typeof x==='string'&&x.length).sort((a,b)=>b.length-a.length))s=s.split(key).join('[redacted]');
 s=s.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi,'Bearer [redacted]').replace(/\bgsk_[A-Za-z0-9_-]+/g,'[redacted]');
 s=s.replace(/((?:api[_-]?key|token|password|authorization)\s*[:=]\s*)[^\s,;"']+/gi,'$1[redacted]');
 return s.slice(0,max);
}
function usage(u){
 if(!u||!['prompt_tokens','completion_tokens','total_tokens'].every(k=>Number.isSafeInteger(u[k])&&u[k]>=0)||u.prompt_tokens+u.completion_tokens!==u.total_tokens)return null;
 return Object.fromEntries(['prompt_tokens','completion_tokens','total_tokens'].map(k=>[k,u[k]]));
}
function candidate(value,schema,secrets,depth=0){
 if(depth>16)return '[omitted: depth]';
 if(value===null||typeof value==='number'||typeof value==='boolean')return value;
 if(typeof value==='string')return text(value,secrets,16384);
 if(Array.isArray(value))return value.slice(0,32).map(v=>candidate(v,schema?.items,secrets,depth+1));
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>!blockedKey.test(k)&&Object.hasOwn(schema?.properties||{},k)).map(([k,v])=>[k,candidate(v,schema.properties[k],secrets,depth+1)]));
 return null;
}
// Diagnostics contain schema-owned paths/rules only, never provider values or unknown property names.
function schemaIssues(value,schema,path='$',issues=[]){
 if(issues.length>=32)return issues;
 const add=rule=>{if(issues.length<32)issues.push({path,rule});};
 const type=Array.isArray(value)?'array':value===null?'null':typeof value;
 const validType=schema.type==='integer'?Number.isSafeInteger(value):schema.type==='object'?type==='object':schema.type===type;
 if(!validType){add('type');return issues;}
 if(schema.enum&&!schema.enum.includes(value))add('enum');
 if(type==='string'){if(schema.minLength!==undefined&&value.length<schema.minLength)add('minLength');if(schema.maxLength!==undefined&&value.length>schema.maxLength)add('maxLength');}
 if(typeof value==='number'){if(schema.minimum!==undefined&&value<schema.minimum)add('minimum');if(schema.maximum!==undefined&&value>schema.maximum)add('maximum');}
 if(type==='array'){if(schema.minItems!==undefined&&value.length<schema.minItems)add('minItems');if(schema.maxItems!==undefined&&value.length>schema.maxItems)add('maxItems');value.slice(0,32).forEach((v,i)=>schemaIssues(v,schema.items,path+'['+i+']',issues));}
 if(type==='object'){
  for(const key of schema.required||[])if(!Object.hasOwn(value,key)&&issues.length<32)issues.push({path:path+'.'+key,rule:'required'});
  if(schema.additionalProperties===false&&Object.keys(value).some(k=>!Object.hasOwn(schema.properties||{},k)))add('additionalProperties');
  for(const [key,child]of Object.entries(schema.properties||{}))if(Object.hasOwn(value,key))schemaIssues(value[key],child,path+'.'+key,issues);
 }
 return issues;
}
function observe({status,body,headers,secrets=[],outputLimit}){
 const e=body?.error&&typeof body.error==='object'?body.error:{};
 const code=text(e.code,secrets,128),type=text(e.type,secrets,128);
 const classification=status===429?'rate_limit':code==='json_validate_failed'?'json_schema_validation_failed':status===400?'invalid_request':status>=500?'provider_server_error':'provider_http_error';
 const get=k=>typeof headers?.get==='function'?headers.get(k):null;
 const id=[get('x-request-id'),get('x-groq-request-id'),body?.x_groq?.id,body?.request_id,e.request_id].find(v=>typeof v==='string'&&/^req_[a-zA-Z0-9_-]{1,128}$/.test(v));
 const out={httpStatus:status,classification,requestId:id||null,bodyAvailable:body!==null&&body!==undefined,bodyPolicy:'allowlisted_redacted',error:{code,type,message:text(e.message,secrets),param:text(e.param,secrets,256)},reportedUsage:usage(body?.usage||e.usage),publication:false};
 const finish=body?.choices?.[0]?.finish_reason||body?.finish_reason||e.finish_reason;
 out.finishReason=['stop','length','content_filter','tool_calls'].includes(finish)?finish:null;
 out.finishReasonIndicatesLength=out.finishReason===null?null:out.finishReason==='length';
 const retry=get('retry-after');if(typeof retry==='string'&&/^\d+(?:\.\d+)?$/.test(retry)&&Number.isFinite(Number(retry)))out.retryAfterSeconds=Number(retry);
 out.outputLimitReached=out.reportedUsage?out.reportedUsage.completion_tokens===outputLimit:null;
 if(Object.hasOwn(e,'failed_generation')){
  const raw=e.failed_generation;
  out.failedGeneration={provided:true,retained:false};
  if(typeof raw==='string'&&Buffer.byteLength(raw)>262144){out.failedGeneration.reason='size_limit';}
  else{
   let parsed;try{parsed=typeof raw==='string'?JSON.parse(raw):raw;}catch(e){out.failedGeneration.syntaxFailure=/end|unterminated/i.test(e.message)?'incomplete_json':'invalid_json';out.failedGeneration.utf8Bytes=Buffer.byteLength(raw);const position=/position (\d+)/i.exec(e.message);if(position)out.failedGeneration.parseErrorPosition=Number(position[1]);}
   // Unparseable text can mix hidden reasoning and partial JSON; retain metadata only.
   if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&['plan','product','sentences'].some(k=>Object.hasOwn(parsed,k))){
    out.failedGeneration={provided:true,retained:true,schemaValid:C.validSchema(parsed,C.WRITE_SCHEMA),schemaIssues:schemaIssues(parsed,C.WRITE_SCHEMA),format:'sanitized_candidate_json',originalPreserved:false,value:candidate(parsed,C.WRITE_SCHEMA,secrets),publication:false};
   }else out.failedGeneration.reason='unparseable_or_non_candidate';
  }
 }else out.failedGeneration={provided:false,retained:false};
 return out;
}
module.exports={observe,sanitizeCandidate:candidate,schemaIssues};
