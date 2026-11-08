'use strict';
const fs=require('node:fs'),path=require('node:path'),C=require('../../lib/urenavi-core/contracts'),R=require('../../lib/urenavi-core/last-resort');
const inputPath=path.resolve(__dirname,'../../docs/evaluations/20261027-fixed/inputs.json'),frozen=JSON.parse(fs.readFileSync(inputPath,'utf8'));
const out=path.resolve(__dirname,'../../docs/rebuild-20261028/p3-local-first-20261108');
const rows=[];
for(const e of frozen.entries.filter(e=>/room-products|room-unseen|live-local-analysis/.test(e.name)))for(const row of Array.isArray(e.data)?e.data:e.data.items){
 const r=R.generate(row.item),b=R.generate(row.item,{mode:'batch'});
 if(JSON.stringify(r.result)!==JSON.stringify(b.result))throw Error('mode_quality_divergence');
 rows.push({category:row.category||'保存済み洗濯用品',item:row.item,sourceFile:e.name,sourceHash:C.hash(row.item),before:r.baseline?.quality.text||null,after:r.result?.quality.text||null,sourceQuote:r.result?.local.partner?.quote||null,diagnostic:r.diagnostic,automaticStatus:r.localStatus,qualityCertified:false,groqCalls:0});
}
const before=rows.filter(r=>r.before).length,after=rows.filter(r=>r.after).length;
const summary={date:'2026-11-08',baselineSha:'7774e5b66274ced2c00931ce26ff6c9d8c9fe4a4',inputFile:inputPath.split('/').slice(-4).join('/'),inputHash:C.hash(frozen),products:rows.length,automaticReadyBefore:before,automaticReadyAfter:after,automaticReadyRateBefore:before/rows.length,automaticReadyRateAfter:after/rows.length,editorialPassRate:null,groundingErrorCount:null,unchangedReady:rows.filter(r=>r.before&&r.before===r.after).length,lostReady:rows.filter(r=>r.before&&!r.after).length,failures:Object.fromEntries([...new Set(rows.filter(r=>r.diagnostic).map(r=>r.diagnostic.cause))].sort().map(k=>[k,rows.filter(r=>r.diagnostic?.cause===k).length])),groqCandidateCount:0,groqCandidateReason:'No eligible, semantically verified local plan/exhaustion/capacity/claim/review proof exists in this evaluation; a D/F reason alone never qualifies.',groqActualCalls:0,groqUsageRate:0,groqAdoptionRate:null,apiCostPerGeneration:0,costPerEditorialAccepted:null,qualityImprovementProven:false,normalBatchIdentical:true,warning:'Automatic ready is the unchanged existing local gate, not a six-axis quality certificate. Missing historical fields were not invented. No provider comparison was performed.'};
fs.writeFileSync(path.join(out,'evaluation.json'),JSON.stringify({summary,rows},null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
