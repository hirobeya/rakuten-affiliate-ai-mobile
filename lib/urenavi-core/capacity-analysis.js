'use strict';
// Diagnostic arithmetic only; no network and no provider token certification.
const C=require('./contracts');
const bytes=x=>Buffer.byteLength(x,'utf8');
function label(p){
 if(p==='response_format')return 'schema';
 if(p==='messages.0.content')return 'fixedPrompt';
 if(/^source\./.test(p))return p;
 if(p==='generationConditions')return 'conditions';
 if(p==='candidate.plan'||p==='feedback.previous.plan')return 'internalPlan';
 if(/^(candidate|feedback.previous)\.(product|sentences)$/.test(p))return 'generatedBody';
 if(p==='feedback.failures')return 'diagnostics';
 if(p==='feedback.repair')return 'repairInstruction';
 return null;
}
function pieces(x,p='',inner=false){
 if(!inner&&p==='messages.1.content'){
  const a=pieces(JSON.parse(x),'',true);
  const r=[{part:'framing',text:'"'},...a.map(q=>({...q,text:JSON.stringify(q.text).slice(1,-1)})),{part:'framing',text:'"'}];
  if(r.map(q=>q.text).join('')!==JSON.stringify(x))throw Error('noncanonical_user_json');
  return r;
 }
 const part=label(p);if(part)return [{part,text:JSON.stringify(x)}];
 const frame=text=>({part:'framing',text});
 if(Array.isArray(x)){const a=[frame('[')];x.forEach((v,i)=>{if(i)a.push(frame(','));a.push(...pieces(v,p?`${p}.${i}`:String(i),inner));});return [...a,frame(']')];}
 if(x&&typeof x==='object'){const a=[frame('{')];Object.entries(x).forEach(([k,v],i)=>{if(i)a.push(frame(','));a.push(frame(JSON.stringify(k)+':'),...pieces(v,p?`${p}.${k}`:k,inner));});return [...a,frame('}')];}
 return [frame(JSON.stringify(x))];
}
function breakdown(req){
 const chunks=pieces(req),full=JSON.stringify(req);
 if(chunks.map(c=>c.text).join('')!==full)throw Error('partition_mismatch');
 const totals={};for(const c of chunks){const t=totals[c.part]??={utf8Bytes:0,asciiUnits:0,nonAsciiUtf16Units:0,heuristicWeight:0};const n=(c.text.match(/[^\x00-\x7f]/g)||[]).length,a=c.text.length-n;t.utf8Bytes+=bytes(c.text);t.asciiUnits+=a;t.nonAsciiUtf16Units+=n;t.heuristicWeight+=a/4+n*1.4;}
 const weight=Object.values(totals).reduce((a,x)=>a+x.heuristicWeight,0),estimate=C.estimate(req);
 if(Math.abs(Math.ceil(weight+500)-estimate.input)>0)throw Error('estimate_partition_mismatch');
 return {parts:totals,overheadHeuristic:500,rounding:estimate.input-weight-500,estimate,serializedBytes:bytes(full),classification:'additive partition of serialized HTTP JSON heuristic, NOT model prompt tokenization'};
}
// Upper bound for compact JSON.stringify of values passing the local schema validator.
// Six ASCII bytes per UTF-16 unit covers controls and lone surrogates; valid Unicode <=3 bytes/unit.
function schemaBytes(s){
 if(s.enum)return Math.max(...s.enum.map(x=>bytes(JSON.stringify(x))));
 if(s.type==='string'){if(!Number.isSafeInteger(s.maxLength)||s.maxLength<0)throw Error('unbounded_schema_string');return 2+6*s.maxLength;}
 if(s.type==='boolean')return 5;
 // Finite JS numbers stringify within 25 ASCII bytes, including sign and exponent.
 if(s.type==='integer')return 25;
 if(s.type==='array'){if(!Number.isSafeInteger(s.maxItems)||s.maxItems<0)throw Error('unbounded_schema_array');return 2+s.maxItems*schemaBytes(s.items)+Math.max(0,s.maxItems-1);}
 if(s.type==='object'){if(s.additionalProperties!==false)throw Error('unbounded_schema_object');const entries=Object.entries(s.properties);return 2+Math.max(0,entries.length-1)+entries.reduce((n,[k,v])=>n+bytes(JSON.stringify(k))+1+schemaBytes(v),0);}
 throw Error('unsupported_schema');
}
function candidateLimit(){return schemaBytes(C.WRITE_SCHEMA);}
function futureBounds(item,conditions={}){
 const candidate=candidateLimit();
 // feedback ids originate only from schema-valid IDs <=12 UTF-16 units or sentence indices;
 // invalid_structure has no id/detail. Reserve 20 units for diagnostic ids, conservatively.
 const failures=schemaBytes({type:'array',maxItems:64,items:{type:'object',additionalProperties:false,properties:{rule:{type:'string',maxLength:56},id:{type:'string',maxLength:20},detail:{type:'string',maxLength:200}}}});
 return ['review','rewrite','rereview'].map(stage=>{
  const req=C.request(stage,item,{draft:null,failures:null,conditions});
  const base=bytes(JSON.stringify(req));
  return {stage,serializedBytesUpper:base-4+2*candidate+(stage==='rewrite'?-4+2*failures:0),candidateCompactJsonBytesUpper:candidate,failuresCompactJsonBytesUpper:stage==='rewrite'?failures:0,providerInputTokensUpper:null,note:'Compact candidate object inside user JSON string; outer JSON escaping at most doubles compact JSON bytes. Not a token bound, not assumed compatible with 3000 output.'};
 });
}
module.exports={breakdown,schemaBytes,candidateLimit,futureBounds};
