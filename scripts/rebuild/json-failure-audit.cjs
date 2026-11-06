'use strict';
// Offline structural witnesses only. Does not generate product copy or modify any wire.
const C=require('../../lib/urenavi-core/contracts'),W=require('../../lib/urenavi-core/chat-wire'),T=require('./tokenizer-vendor/gpt-tokenizer-4.1.0/cjs/encoding/o200k_harmony.js');
function schemaAudit(schema){
 const counts={objects:0,propertyOccurrences:0,maxDepth:0},issues=[],keywords=new Set();
 function walk(s,d,p){counts.maxDepth=Math.max(counts.maxDepth,d);Object.keys(s).forEach(k=>keywords.add(k));
  if(!['object','array','string','integer','boolean'].includes(s.type))issues.push(p+':unhandled_type');
  if(s.type==='object'){counts.objects++;const keys=Object.keys(s.properties||{});counts.propertyOccurrences+=keys.length;
   if(s.additionalProperties!==false)issues.push(p+':object_not_closed');
   if(!Array.isArray(s.required)||JSON.stringify([...s.required].sort())!==JSON.stringify(keys.sort()))issues.push(p+':required_mismatch');
   Object.entries(s.properties||{}).forEach(([k,v])=>walk(v,d+1,p+'.'+k));
  }
  if(s.type==='array'){if(!s.items)issues.push(p+':items_missing');else walk(s.items,d+1,p+'[]');if(s.minItems>s.maxItems)issues.push(p+':array_bounds');}
  if(s.type==='string'&&s.minLength>s.maxLength)issues.push(p+':string_bounds');
 }
 walk(schema,0,'$');return {...counts,issues,keywords:[...keywords].sort(),providerAcceptanceProven:false};
}
function shapeWitness(s){
 if(s.enum)return s.enum[0];
 if(s.type==='object')return Object.fromEntries(Object.entries(s.properties).map(([k,v])=>[k,shapeWitness(v)]));
 if(s.type==='array')return Array.from({length:s.minItems||0},()=>shapeWitness(s.items));
 if(s.type==='string')return 'a'.repeat(s.minLength||0);
 if(s.type==='integer')return s.minimum||0;
 if(s.type==='boolean')return false;
 throw Error('unsupported_witness_type');
}
function audit(){
 const source=require('../../docs/rebuild-20261028/p3-first-call-gate/first-call-plan.json').selected.source;
 const wire=W.compileCalibration1000(C.request('draft',source)),sample=require('../../tests/rebuild/fixture.cjs').fixture().draft,witness=shapeWitness(C.WRITE_SCHEMA);
 const tokens=x=>T.encode(JSON.stringify(x),{disallowedSpecial:new Set()}).length;
 return {wireHash:C.hash(wire.body),model:wire.body.model,reasoningEffort:wire.body.reasoning_effort,maxCompletionTokens:wire.body.max_completion_tokens,responseFormat:wire.body.response_format.type,strict:wire.body.response_format.json_schema.strict,writer:schemaAudit(C.WRITE_SCHEMA),review:schemaAudit(C.REVIEW),shapeWitness:{schemaValid:C.validSchema(witness,C.WRITE_SCHEMA),tokens:tokens(witness),qualityValid:false},syntheticFixture:{schemaValid:C.validSchema(sample,C.WRITE_SCHEMA),tokens:tokens(sample),planTokens:tokens(sample.plan)},promptSentenceRange:[1,3],schemaSentenceRange:[C.WRITE_SCHEMA.properties.sentences.minItems,C.WRITE_SCHEMA.properties.sentences.maxItems],note:'Local o200k_harmony counts of synthetic JSON, not provider framing, actual failed output, a global token lower bound or quality evidence. No wire change.'};
}
if(require.main===module)process.stdout.write(JSON.stringify(audit(),null,2)+'\n');
module.exports={audit,schemaAudit};
