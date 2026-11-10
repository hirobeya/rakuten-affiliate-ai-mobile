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
   if(text.length<2||text.length>260)continue;
   passages.push({id:passages.length,field,start,end:start+text.length,text,role:'unverified_product_passage'});
  }
 }
 return {notice:'Exact passages only. IDs do not approve ownership, conditions or claims. Search keyword sections are not evidence. Read ALL unchanged original fields.',passages,excluded};
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
module.exports={build,schema,restore};
