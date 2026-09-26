'use strict';
const fs=require('fs');
function once(file,from,to){let s=fs.readFileSync(file,'utf8');if(!s.includes(from))throw new Error('target missing: '+from.slice(0,80));fs.writeFileSync(file,s.replace(from,to));}

const oldGate=`  const softReasons=new Set(['invalid_features_dropped']);
  const blockingReasons=reasons.filter(x=>!softReasons.has(x));
  const full=(v.mode==='simple'||v.mode==='simple_partial') && v.productType?.valid===true && blockingReasons.length===0;
  return {
    enabled:true,
    status:full?'full':'fallback',
    full,`;
const newGate=`  const softReasons=new Set(['invalid_features_dropped']);
  const blockingReasons=reasons.filter(x=>!softReasons.has(x));
  const validatedFull=(v.mode==='simple'||v.mode==='simple_partial') && v.productType?.valid===true && blockingReasons.length===0;
  const fallbackIdentity=safeSearchIdentity(item);
  const groundedFallback=Boolean(fallbackIdentity);
  const full=validatedFull||groundedFallback;
  return {
    enabled:true,
    status:full?'full':'fallback',
    full,
    validatedFull,
    groundedFallback,
    fallbackIdentity,`;
once('public/app.html',oldGate,newGate);

const oldToday=`      const insight=aiSalesInsight(i,aiRoomResults.get(chosen.index)?.data);
      audience=insight.audience;points=insight.benefits;`;
const newToday=`      const insight=aiSalesInsight(i,aiRoomResults.get(chosen.index)?.data);
      audience=String(insight.productType||'');
      points=(insight.sellingPoints.length?insight.sellingPoints:insight.features).slice(0,2);`;
once('public/app.html',oldToday,newToday);

const testFile='tests/room-ai-phase1.test.js';
let t=fs.readFileSync(testFile,'utf8');
const anchor=`    assert.match(html,/source\\.includes\\(qc\\)\\?q:''/);\n  });`;
if(!t.includes(anchor)) throw new Error('test anchor missing');
t=t.replace(anchor,`    assert.match(html,/source\\.includes\\(qc\\)\\?q:''/);\n    assert.match(html,/const fallbackIdentity=safeSearchIdentity\\(item\\)/);\n    assert.match(html,/const groundedFallback=Boolean\\(fallbackIdentity\\)/);\n    assert.match(html,/const full=validatedFull\\|\\|groundedFallback/);\n    assert.match(html,/audience=String\\(insight\\.productType\\|\\|''\\)/);\n    assert.match(html,/points=\\(insight\\.sellingPoints\\.length\\?insight\\.sellingPoints:insight\\.features\\)\\.slice\\(0,2\\)/);\n  });`);
fs.writeFileSync(testFile,t);
console.log('grounded fallback wired into main post path');
