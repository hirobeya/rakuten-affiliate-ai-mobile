'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {localZeroCall,resolveIdentityHint}=require('../api/room-ai-v3');
const {composeLocalPartnerCopy}=require('../lib/local-partner-reasoner');
const structured=require('../public/structured-room-copy');
const {tokens,scoreCandidate,operatorSupports,independentEvidenceCount,strongLeadingDeclaration}=require('../lib/local-semantic-composer');
const {safeTitleFacts}=require('../lib/local-generic-reasoner');

const sources=[
  require('./fixtures/rakuten-large-genres-20260925-01.json'),
  require('./fixtures/rakuten-large-genres-20260925-02.json'),
  require('./fixtures/rakuten-large-genres-20260925-03a.json'),
  require('./fixtures/rakuten-large-genres-20260925-03b.json'),
  require('./fixtures/rakuten-large-genres-20260925-04a.json'),
  require('./fixtures/rakuten-large-genres-20260925-05.json')
];

function flatten(){
  return sources.flatMap(source=>
    (source.genres||[]).flatMap(genre=>
      (genre.items||[]).map((item,index)=>({
        ...item,
        itemCaption:String(item.itemCaption||''),
        category:String(genre.nameJa||genre.genreId||'unknown'),
        fixtureIndex:index
      }))
    )
  );
}

function extendedSemanticCandidate(item){
  const title=String(item?.itemName||'').normalize('NFKC').replace(/\s+/g,' ').trim();
  const parts=tokens(title);
  const facts=safeTitleFacts(title);
  const operators=operatorSupports(title);
  const rows=[];
  for(let i=5;i<Math.min(10,parts.length);i++){
    const row=scoreCandidate({value:String(parts[i]||'').trim(),index:i,parts,title,caption:String(item?.itemCaption||''),facts,operators});
    if(row) rows.push(row);
  }
  rows.sort((a,b)=>b.total-a.total||a.index-b.index||b.value.length-a.value.length);
  const best=rows[0],runner=rows[1];
  if(!best||best.total<4) return null;
  if(best.index>0&&best.lexical.length===0) return null;
  const nearTie=Boolean(runner&&best.total-runner.total<1.5);
  if(nearTie&&!strongLeadingDeclaration(best,facts,operators)) return null;
  if(best.featurePenalty>0&&best.lexical.length===0) return null;
  const supportKinds=[];
  if(best.lexical.length) supportKinds.push('lexical');
  if(facts.length) supportKinds.push('grounded_fact');
  if(operators.length) supportKinds.push('operator');
  if(best.nounShape>0) supportKinds.push('noun_shape');
  if(strongLeadingDeclaration(best,facts,operators)) supportKinds.push('leading_declaration');
  if(supportKinds.length<2) return null;
  return {value:best.value,index:best.index,total:Number(best.total.toFixed(2)),supportKinds,lexical:best.lexical.slice(0,3).map(x=>x.common)};
}

function suspiciousLocalText(result){
  const text=String(result?.quality?.text||'');
  const identity=String(result?.productType?.specific||'').trim();
  const lines=text.split('\n').map(x=>x.trim()).filter(Boolean);
  const contentLines=lines.filter(x=>!/^※アフィリエイト広告/.test(x)&&!/^価格：/.test(x));
  const identityOnly=identity&&contentLines.some(x=>x===identity+'です。');
  const rechargeOnly=/充電して使うタイプです/.test(text)&&!/コードをつながずに使うタイプです/.test(text);
  const batteryOnly=/電源方式まで見て選ぶなら/.test(text)&&/電池式の/.test(text);
  const bareConnector=/(?:USB-C|Type-C)表記の.+です/.test(text);
  const bareEnvironment=/(?:防水|撥水)仕様の.+です/.test(text);
  const bareCaster=/キャスター付きの.+です/.test(text);
  return {identityOnly,rechargeOnly,batteryOnly,bareConnector,bareEnvironment,bareCaster};
}

test('fixed 780 local gate keeps thin local completions at zero',()=>{
  const items=flatten();
  assert.equal(items.length,780);

  const rows=[];
  const extendedIdentityCandidates=[];
  const deferredReasons={};
  const bump=reason=>{deferredReasons[reason]=(deferredReasons[reason]||0)+1;};
  for(const item of items){
    const result=localZeroCall(item);
    if(!result){
      const identity=resolveIdentityHint(item);
      if(!identity){
        bump('identity_unresolved');
        const extended=extendedSemanticCandidate(item);
        if(extended) extendedIdentityCandidates.push({category:item.category,itemCode:item.itemCode||'',itemName:item.itemName,...extended});
        continue;
      }
      const partner=composeLocalPartnerCopy({itemName:item.itemName,itemCaption:item.itemCaption,identity,itemPrice:item.itemPrice});
      if(partner){bump('partner_guarded_or_conflicting');continue;}
      const copy=structured.compose({...item,itemCaption:''},{identity});
      if(copy?.status!=='ok'){bump('structured_not_ready');continue;}
      const facts=Array.isArray(copy?.facts)?copy.facts:[];
      const values=Array.isArray(copy?.values)?copy.values:[];
      if(!facts.length){bump('no_structured_facts');continue;}
      if(!values.length){bump('facts_without_purchase_value');continue;}
      bump('structured_value_deferred_by_quality_gate');
      continue;
    }
    const flags=suspiciousLocalText(result);
    rows.push({
      category:item.category,
      itemCode:item.itemCode||'',
      productType:result.productType?.specific||'',
      method:result.local?.method||'',
      text:result.quality?.text||'',
      flags
    });
  }

  const suspicious=rows.filter(row=>Object.values(row.flags).some(Boolean));
  const byMethod=rows.reduce((acc,row)=>{
    const key=row.method||'unknown';
    acc[key]=(acc[key]||0)+1;
    return acc;
  },{});

  console.log('FIXED780_LOCAL_GATE '+JSON.stringify({
    total:items.length,
    localComplete:rows.length,
    groqNeeded:items.length-rows.length,
    localRate:Number((rows.length/items.length).toFixed(4)),
    byMethod,
    deferredReasons,
    extendedIdentityCandidateCount:extendedIdentityCandidates.length,
    extendedIdentityCandidates:extendedIdentityCandidates.slice(0,30),
    suspiciousCount:suspicious.length,
    suspicious:suspicious.slice(0,20)
  }));

  assert.deepEqual(suspicious,[]);
});
