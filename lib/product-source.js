'use strict';
// Transport only; this does not select facts or approve a purchase reason.
// Never turn a partially retained clause (e.g. 防水不可) into positive proof.
function boundedSource(value,limit){
  const text=String(value||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
  if(text.length<=limit)return text;
  const prefix=text.slice(0,limit);
  const boundaries=[...prefix.matchAll(/[。！？!?\n]/g)];
  return boundaries.length?prefix.slice(0,boundaries.at(-1).index+1).trim():'';
}
module.exports={boundedSource};
