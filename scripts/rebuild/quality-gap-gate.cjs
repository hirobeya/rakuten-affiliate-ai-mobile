'use strict';
// Read-only, offline quality baseline. Does not authorize publication or provider calls.
const fs=require('node:fs');
const path=require('node:path');
const AXES=['understanding','specificity','choice','audience_value','naturalness','grounded'];
function summarize(review){
  if(!review||!Number.isSafeInteger(review.fixedSetDenominator)||review.fixedSetDenominator<1||!Array.isArray(review.rows))throw Error('quality_baseline_invalid');
  const codes=new Set(),axisCounts=Object.fromEntries(AXES.map(a=>[a,{pass:0,weak:0,fail:0}]));
  let allPassed=0;
  for(const row of review.rows){
    if(!row||typeof row.itemCode!=='string'||!row.itemCode||codes.has(row.itemCode)||!row.sourceHash||typeof row.text!=='string'||!row.text.trim())throw Error('quality_baseline_invalid_row');
    codes.add(row.itemCode);
    for(const axis of AXES){
      const verdict=row.axes?.[axis];
      if(!['pass','weak','fail'].includes(verdict))throw Error('quality_baseline_missing_axis:'+axis);
      axisCounts[axis][verdict]++;
    }
    const passed=AXES.every(axis=>row.axes[axis]==='pass');
    if(row.allAxesPass!==passed)throw Error('quality_baseline_row_disagreement');
    if(passed)allPassed++;
  }
  if(review.reviewedGeneratedTexts!==review.rows.length||review.notGenerated+review.reviewedGeneratedTexts!==review.fixedSetDenominator||review.allAxesPassAfter!==allPassed||allPassed>review.rows.length)throw Error('quality_baseline_totals_mismatch');
  return {sampleCount:review.fixedSetDenominator,generated:review.rows.length,notGenerated:review.notGenerated,allPassed,fullPassRate:allPassed/review.fixedSetDenominator,axes:axisCounts,qualityComplete:allPassed===review.fixedSetDenominator};
}
function load(file=path.join(__dirname,'../../docs/rebuild-20261028/p3-local-first-20261108/editorial-review.json')){return summarize(JSON.parse(fs.readFileSync(file,'utf8')));}
if(require.main===module){process.stdout.write(JSON.stringify(load(),null,2)+'\n');}
module.exports={AXES,summarize,load};
