'use strict';
// Read-only whole-corpus diagnosis. Never relax the publishing safety gate.
const fs=require('node:fs');
const path=require('node:path');
const structured=require('../public/structured-room-copy.js');
const safety=require('../public/fact-safety.js');
const dir=path.join(__dirname,'../tests/fixtures');
const files=fs.readdirSync(dir).filter(x=>/^rakuten-large-genres-20260925-.*\.json$/.test(x)).sort();
const totals={total:0,composed:0,ready:0,guardChanged:0,guardRejected:0};
const failures=new Map(),domains=new Map(),examples=new Map(),unreadyGenerated=new Map();
const missingEvidenceByGenre=new Map(),missingEvidenceExamples=new Map();
for(const file of files){
  const json=JSON.parse(fs.readFileSync(path.join(dir,file),'utf8'));
  for(const genre of json.genres||[])for(const raw of genre.items||[]){
    totals.total++;
    const item={...raw,catchcopy:raw.catchcopy||'',itemCaption:raw.itemCaption||''};
    const result=structured.compose(item);
    const assessment=structured.assess(item);
    const domain=result.understanding?.domain||'unresolved';
    const group=domains.get(domain)||{total:0,composed:0,ready:0};
    group.total++;if(result.text){group.composed++;totals.composed++;}
    if(assessment.ready){group.ready++;totals.ready++;}
    domains.set(domain,group);
    const after=safety.guardUnsupportedBenefitCopy(item,result.text);
    if(result.text&&after!==result.text)totals.guardChanged++;
    if(result.text&&!after)totals.guardRejected++;
    if(result.text&&!assessment.ready){
      const selected=result.values.filter(value=>value?.text&&result.text.includes(value.text));
      const key=[result.status,selected.length?'value_visible':'value_not_selected',result.values.length+' values',result.understanding?.domain||'unknown'].join('|');
      unreadyGenerated.set(key,(unreadyGenerated.get(key)||0)+1);
    }
    if(!result.facts.length){
      const genreName=String(genre.genreName||genre.name||genre.genreId||file);
      missingEvidenceByGenre.set(genreName,(missingEvidenceByGenre.get(genreName)||0)+1);
      if(!missingEvidenceExamples.has(genreName))missingEvidenceExamples.set(genreName,String(item.itemName||'').slice(0,140));
    }
    if(!assessment.ready){
      const reason=[assessment.reason,result.understanding?.reason||'none',result.facts.length?'facts':'no_facts',result.values.length?'values':'no_values'].join('|');
      failures.set(reason,(failures.get(reason)||0)+1);
      if(!examples.has(reason))examples.set(reason,{itemName:String(item.itemName||'').slice(0,140),domain,facts:result.facts.map(x=>x.quote),values:result.values.map(x=>x.text)});
    }
  }
}
const byFailure=[...failures].sort((a,b)=>b[1]-a[1]).map(([reason,count])=>({reason,count,example:examples.get(reason)}));
const report={totals,missingEvidenceByGenre:[...missingEvidenceByGenre].sort((a,b)=>b[1]-a[1]).slice(0,25).map(([genre,count])=>({genre,count,example:missingEvidenceExamples.get(genre)})),unreadyGenerated:Object.fromEntries([...unreadyGenerated].sort((a,b)=>b[1]-a[1])),byDomain:Object.fromEntries([...domains].sort((a,b)=>b[1].total-a[1].total)),byFailure};
console.log(JSON.stringify(report,null,2));
if(process.argv.includes('--strict')&&totals.ready<112)process.exitCode=1;
