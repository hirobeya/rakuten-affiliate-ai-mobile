'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {localZeroCall}=require('../api/room-ai-v3');

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
  for(const item of items){
    const result=localZeroCall(item);
    if(!result) continue;
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
    suspiciousCount:suspicious.length,
    suspicious:suspicious.slice(0,20)
  }));

  assert.deepEqual(suspicious,[]);
});
