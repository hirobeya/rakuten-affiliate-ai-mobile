(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.RoomCopyResult=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
 'use strict';
 const MAX_ROOM_POST_CHARS=500;
 const DISCLOSURE='※アフィリエイト広告を利用しています';
 const compose=sentences=>sentences.map(s=>s.text.normalize('NFKC').replace(/[‐‑‒–—−]/g,'-').replace(/\s+/g,' ').trim()).join('\n\n')+'\n\n'+DISCLOSURE;
 const fitsLength=text=>typeof text==='string'&&Array.from(text).length<=MAX_ROOM_POST_CHARS;
 const canonical=result=>String(result?.version||'').startsWith('room_contract_');
 function ready(result){
  if(!canonical(result)||result.ok!==true||result.pending!==false||result.quality?.status!=='ready'||result.quality?.machine?.ok!==true||result.quality?.review?.ok!==true)return '';
  if(!result.product?.what||!result.product.acts_on||!result.product.acts_on_quote||!Array.isArray(result.sentences)||!result.sentences.length)return '';
  if(result.sentences.some(s=>typeof s.text!=='string'||!s.text.trim()||!Array.isArray(s.quotes)||!s.quotes.length||!Array.isArray(s.kinds)||!s.kinds.length||s.kinds.some(k=>!['spec','benefit','scene'].includes(k))))return '';
  const text=compose(result.sentences);
  if(!fitsLength(text))return '';
  if(result.quality.text!==text||result.variants?.length!==1||result.variants[0].text!==text)return '';
  return text;
 }
 function ledger(result){return ready(result)?result.sentences.map((s,i)=>({text:s.text,facts:result.quality.ledger?.[i]||[]})):[];}
 return {MAX_ROOM_POST_CHARS,DISCLOSURE,compose,fitsLength,canonical,ready,ledger};
});
