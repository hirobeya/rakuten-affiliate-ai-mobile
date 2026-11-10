'use strict';
// References locate original source spans; they never certify meaning or scope.
function build(item){
 const passages=[],excluded=[];
 for(const field of ['itemName','itemCaption','catchcopy']){
  const source=String(item[field]||'');let end=source.length;
  if(field==='itemCaption')for(const label of ['検索用キーワード','商品補足説明']){const at=source.indexOf(label);if(at>=0){const start=at>0&&source[at-1]==='「'?at-1:at;end=Math.min(end,start);}}
  if(end<source.length)excluded.push({field,start:end,end:source.length,role:'search_keywords_not_product_evidence'});
  const pattern=/[^●※。\n\r]+[。]?/g;let match;
  while((match=pattern.exec(source.slice(0,end)))){
   const lead=match[0].search(/\S/);if(lead<0)continue;
   const text=match[0].slice(lead).trimEnd(),start=match.index+lead;
   if(text.length<2)continue;
   // Previous implementation silently discarded every source clause longer
   // than 260 characters. On the frozen 44-product corpus this removed
   // passages from 16 products, making those facts impossible to cite.
   // Exact overlapping windows preserve source positions without inventing
   // words. A partial window is NEVER itself evidence of complete scope:
   // the full source stays available to the writer and independent reviewer.
   let from=0;
   while(from<text.length){
    let to=Math.min(text.length,from+240);
    if(to<text.length){
     const tail=text.slice(from+120,to),boundary=Math.max(tail.lastIndexOf('、'),tail.lastIndexOf('，'),tail.lastIndexOf(','),tail.lastIndexOf('；'),tail.lastIndexOf(';'));
     if(boundary>=0)to=from+120+boundary+1;
    }
    const piece=text.slice(from,to);
    if(piece.length>=2)passages.push({id:passages.length,field,start:start+from,end:start+to,text:piece,role:to<text.length||from>0?'unverified_partial_passage':'unverified_product_passage'});
    if(to===text.length)break;
    from=Math.max(from+1,to-20);
   }
  }
 }
 return {notice:'Exact passages only. Long original clauses are overlapping partial windows and may cut a negation or condition: never infer ownership, completeness or results from one window. Read ALL unchanged original fields and preserve full scope. Search keyword sections are not evidence.',passages,excluded};
}
// Only the numeric IDs and locations are needed in the MODEL prompt.
// The untouched original fields are already sent in the same request.
// Repeating entire Japanese quotations doubles prompt cost and can push the
// Free-tier TPM reservation over 8K. Small excerpts orient the model; it
// must resolve complete conditions by reading the original source fields.
// The SERVER still reconstructs the full original quote from build().
function forModel(ledger){
 return {...ledger,notice:ledger.notice+' The preview is NOT complete evidence: use field/start/end to read the complete original source.',passages:ledger.passages.map(p=>({
  id:p.id,field:p.field,start:p.start,end:p.end,
  preview:p.text.length>84?p.text.slice(0,84)+'…':p.text,role:p.role
 }))};
}
function schema(base,ledger){
 if(!ledger.passages.length)throw Error('editorial_source_coverage_unavailable');
 const out=structuredClone(base),ids={type:'integer',enum:ledger.passages.map(p=>p.id)};
 const p=out.properties.product;delete p.properties.acts_on_quote;p.properties.sourceId=ids;p.required=p.required.map(k=>k==='acts_on_quote'?'sourceId':k);
 const s=out.properties.sentences.items;delete s.properties.quotes;s.properties.sourceIds={type:'array',minItems:1,maxItems:3,items:ids};s.required=s.required.map(k=>k==='quotes'?'sourceIds':k);
 return out;
}
function restore(raw,item){
 const ledger=build(item),quote=id=>{if(!Number.isSafeInteger(id)||!ledger.passages[id])throw Error('invalid_editorial_source_identity');return ledger.passages[id].text;};
 if(!raw?.product||Object.hasOwn(raw.product,'acts_on_quote')||!Array.isArray(raw.sentences)||raw.sentences.length<1||raw.sentences.length>6)throw Error('invalid_editorial_source_contract');
 const {sourceId,...product}=raw.product;
 const sentences=raw.sentences.map(row=>{if(Object.hasOwn(row,'quotes')||!Array.isArray(row.sourceIds)||row.sourceIds.length<1||row.sourceIds.length>3||new Set(row.sourceIds).size!==row.sourceIds.length)throw Error('invalid_editorial_source_contract');const {sourceIds,...sentence}=row;return {...sentence,quotes:sourceIds.map(quote)};});
 return {product:{...product,acts_on_quote:quote(sourceId)},sentences};
}
module.exports={build,forModel,schema,restore};
