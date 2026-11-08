'use strict';
const test=require('node:test'),fs=require('node:fs'),path=require('node:path');
const R=require('../../lib/urenavi-core/last-resort');
const input=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../../docs/evaluations/20261027-fixed/inputs.json'),'utf8'));
const labels={
 'goodgoods-center:10000193':'靴下',
 'bos-shop:10000023':'臭わない袋',
 'pasoro:10001354':'バイクグローブ',
 'repeat7:10002729':'おそうじ手袋',
 'fujisports-r:10054189':'お米',
 '40s-skincare:10000159':'ヘアブラシ',
 'bbtown:10225214':'グローブ',
 'lebenwood:10004953':'洗濯ネット'
};
test('diagnostic: synthetic exact-title genre hints must not be reported as real Rakuten metadata',()=>{
 const rows=[];
 for(const e of input.entries.filter(e=>/room-products|room-unseen|live-local-analysis/.test(e.name))){
  for(const v of Array.isArray(e.data)?e.data:e.data.items){
   if(!labels[v.item.itemCode])continue;
   const hint=labels[v.item.itemCode],baseline=R.generate(v.item);
   const assisted=R.generate({...v.item,genreName:hint,genrePath:'検証用 > '+hint});
   rows.push({id:v.item.itemCode,syntheticHint:hint,before:!!baseline.result,after:!!assisted.result,proof:assisted.genreEvidence||null,diagnostic:assisted.diagnostic});
   if(baseline.result&&assisted.result&&baseline.result.quality.text!==assisted.result.quality.text)throw Error('successful_local_result_changed');
   if(assisted.groqCalls!==0)throw Error('unexpected_provider_use');
  }
 }
 console.log('GENRE_SIMULATION_DIAGNOSTIC '+JSON.stringify(rows));
});
