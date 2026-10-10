'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {localZeroCall,resolveIdentityHint,extractLiteralSpecs}=require('../api/room-ai-v3');
const {composeLocalPartnerCopy}=require('../lib/local-partner-reasoner');
const structured=require('../public/structured-room-copy');

const sources=[
  require('./fixtures/rakuten-large-genres-20260925-01.json'),
  require('./fixtures/rakuten-large-genres-20260925-02.json'),
  require('./fixtures/rakuten-large-genres-20260925-03a.json'),
  require('./fixtures/rakuten-large-genres-20260925-03b.json'),
  require('./fixtures/rakuten-large-genres-20260925-04a.json'),
  require('./fixtures/rakuten-large-genres-20260925-05.json')
];

const items=sources.flatMap(source=>(source.genres||[]).flatMap(genre=>(genre.items||[]).map(item=>({
  ...item,itemCaption:String(item.itemCaption||''),category:String(genre.nameJa||genre.genreId||'unknown')
}))));

function classify(item){
  const local=localZeroCall(item);
  if(local) return {reason:'local_complete',identity:local.productType?.specific||'',partner:Boolean(local.local?.partner)};

  const identity=resolveIdentityHint(item);
  if(!identity) return {reason:'identity_unresolved',identity:''};

  const titleOnly={...item,itemCaption:''};
  const partner=composeLocalPartnerCopy({
    itemName:titleOnly.itemName,
    itemCaption:item.itemCaption,
    identity,
    itemPrice:item.itemPrice
  });
  if(partner) return {reason:'partner_candidate_blocked_later',identity,partner:true,quote:partner.quote,axis:partner.axis||''};

  const copy=structured.compose(titleOnly,{identity});
  if(copy?.status!=='ok') return {reason:'structured_not_ready',identity,status:copy?.status||'none'};

  const facts=Array.isArray(copy?.facts)?copy.facts:[];
  const values=Array.isArray(copy?.values)?copy.values:[];
  const literal=extractLiteralSpecs(titleOnly);
  if(!facts.length&&!literal.length) return {reason:'no_grounded_fact',identity};
  if(!values.length) return {reason:'facts_without_purchase_value',identity,facts:facts.map(x=>x.quote).slice(0,5)};
  return {reason:'structured_value_deferred',identity,facts:facts.map(x=>x.quote).slice(0,5),values:values.map(x=>x.text).slice(0,5)};
}

test('fixed 780 routing diagnostic classifies Groq-bound items by structural reason',()=>{
  assert.equal(items.length,780);
  const rows=items.map(item=>({category:item.category,itemCode:item.itemCode||'',itemName:item.itemName,...classify(item)}));
  const counts=rows.reduce((acc,row)=>{acc[row.reason]=(acc[row.reason]||0)+1;return acc;},{});
  const examples={};
  for(const row of rows){
    if(!examples[row.reason]) examples[row.reason]=[];
    if(examples[row.reason].length<8) examples[row.reason].push({
      category:row.category,itemCode:row.itemCode,itemName:row.itemName,
      identity:row.identity,quote:row.quote||'',axis:row.axis||'',facts:row.facts||[],values:row.values||[]
    });
  }
  console.log('FIXED780_ROUTING_DIAGNOSTICS '+JSON.stringify({total:rows.length,counts,examples}));
});
