'use strict';
// Model-facing IDs avoid copying long Japanese sentences through strict enum.
// The original draft remains immutable; no approximate text matching or repair.
function request(base,state){
 const sentences=state?.draft?.sentences;
 if(!Array.isArray(sentences)||!sentences.length||sentences.length>6||sentences.some(s=>typeof s?.text!=='string'||!s.text))throw Error('invalid_indexed_review_draft');
 const schema=structuredClone(base.schema),row=schema.properties.sentences.items;
 delete row.properties.text;row.properties.sentenceId={type:'integer',enum:sentences.map((_,i)=>i)};
 row.required=row.required.map(k=>k==='text'?'sentenceId':k);
 const userPayload=structuredClone(base.userPayload);
 userPayload.draft.sentences=userPayload.draft.sentences.map((s,sentenceId)=>({...s,sentenceId}));
 return {...base,schema,schemaName:'room_indexed_final_review',userPayload,
  systemPrompt:base.systemPrompt.replace('select text VERBATIM','select sentenceId exactly').replace('Do not rewrite, shorten or translate text; the enum contains the only allowed texts.','Do not output or rewrite text. sentenceId selects the exact immutable input sentence.').replace('select text VERBATIM','select sentenceId exactly')+'\nReturn sentenceId instead of text for EVERY input sentence exactly once. IDs are identity only: assess every factual clause of its full text, evidence and all five verdicts. Never substitute an ID for semantic review.'};
}
function restore(raw,state){
 const sentences=state?.draft?.sentences;
 if(!Array.isArray(sentences)||!Array.isArray(raw?.sentences)||raw.sentences.length!==sentences.length)throw Error('invalid_indexed_review_coverage');
 const seen=new Set();
 const rows=raw.sentences.map(row=>{
  const id=row?.sentenceId;
  if(!Number.isSafeInteger(id)||id<0||id>=sentences.length||seen.has(id)||Object.hasOwn(row,'text'))throw Error('invalid_indexed_review_identity');
  seen.add(id);const {sentenceId,...verdict}=row;
  return {...verdict,text:sentences[id].text};
 });
 return {...raw,sentences:rows};
}
module.exports={request,restore};
