'use strict';
// Reproducible, offline-only assessment of four actual acquired Rakuten fixtures.
// Reports failures of copy availability without claiming six-axis publication quality.
const fs=require('node:fs');
const path=require('node:path');
const {generate}=require('../../lib/urenavi-core/last-resort');
const {hash}=require('../../lib/room-writer-raw/source');
const base=path.join(__dirname,'../../docs/experiments/raw-source-fallback-20261111/acquisition-20261111/fresh-products');
function replay(){
 const rows=[];
 for(const index of [3,4,5,6]){
  const file=path.join(base,String(index).padStart(2,'0')+'.json');
  const stored=JSON.parse(fs.readFileSync(file,'utf8'));
  const actual=generate(structuredClone(stored.source),{mode:'normal'});
  const exact=hash(actual)===hash(stored.local);
  const noProvider=actual.groqCalls===0;
  const text=typeof actual?.result?.quality?.text==='string'?actual.result.quality.text:null;
  rows.push({
   index,itemCode:stored.source.itemCode,
   sourceHash:stored.sourceHash,
   originalFixture:file.split(path.sep).slice(-1)[0],
   outputHash:text===null?null:hash(text),
   reproducedExactly:exact,
   noProviderCalls:noProvider,
   sourcePreserved:actual.sourceHash===stored.local.sourceHash,
   localStatus:actual.localStatus,
   diagnostic:actual.diagnostic||null,
   localText:text,
   qualityStatus:'unverified',
   liveGroqCandidateEligible:false
  });
 }
 return {version:'urenavi-local-four-offline-proof-v1',kind:'actual_local_engine_replay',disclaimer:'No text is not a six-axis quality failure; no live Groq call was made.',rows,
  allReproduced:rows.every(r=>r.reproducedExactly&&r.noProviderCalls&&r.sourcePreserved),
  completePostCount:rows.filter(r=>typeof r.localText==='string'&&r.localText.trim()).length,
  groqCalls:0
 };
}
if(require.main===module){
 const result=replay();
 process.stdout.write(JSON.stringify(result,null,2)+'\n');
 if(!result.allReproduced)process.exitCode=1;
}
module.exports={replay};
