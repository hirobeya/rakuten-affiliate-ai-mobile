'use strict';
// Strictly advisory formatting candidate. Publication stays with the existing
// full source/semantic/editorial checks; this module never sets quality ready.
const {createHash}=require('node:crypto');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const MAX_MARKERS=3;
function propose({item,originalText,sourceQuote}={}){
  if(!item||typeof item.itemCaption!=='string'||typeof item.itemName!=='string'||typeof originalText!=='string'||typeof sourceQuote!=='string'||!sourceQuote.trim())return null;
  // Do not rewrite a claim without an exact provenance quote from this product.
  if(![item.itemCaption,item.itemName].some(s=>s.includes(sourceQuote))||!originalText.includes(sourceQuote))return null;
  // Only a limited heading syntax is eligible; content is removed, not interpreted.
  // Never mistake inequalities or substantive HTML for harmless visual labels.
  const heading=/<([\p{L}\p{N}][\p{L}\p{N} \-]{1,22})>\s*/gu;
  const matches=[...sourceQuote.matchAll(heading)];
  if(!matches.length||matches.length>MAX_MARKERS||matches.some(m=>!m.index||m.index>2))return null;
  const cleanedQuote=sourceQuote.replace(heading,'').trim();
  if(!cleanedQuote||cleanedQuote===sourceQuote||cleanedQuote.length<12)return null;
  const clean=originalText.replace(sourceQuote,cleanedQuote);
  if(clean===originalText||clean.includes('<')||clean.includes('>'))return null;
  const before=originalText.replace(sourceQuote,'');
  const after=clean.replace(cleanedQuote,'');
  if(before!==after)return null;
  return Object.freeze({status:'requires_full_editorial_review',publication:false,copyable:false,
    originalHash:hash(originalText),sourceHash:hash({itemName:item.itemName,itemCaption:item.itemCaption,sourceQuote}),
    originalText,proposedText:clean,removedHeadingMarkers:matches.length,
    reason:'source_heading_markup_only; semantic quality and scope unverified'});
}
module.exports={propose};
