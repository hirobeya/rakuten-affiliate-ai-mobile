const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'../public/app.html'),'utf8');

test('ROOM link opens outside standalone PWA but stays same-tab in normal browser',()=>{
  const start=html.indexOf('function isStandaloneApp(');
  const end=html.indexOf('function hist(',start);
  assert.ok(start>=0 && end>start);
  const snippet=html.slice(start,end);
  assert.match(snippet,/navigator\.standalone===true/);
  assert.match(snippet,/display-mode: standalone/);
  assert.match(snippet,/target=\\"_blank\\"/);
  assert.match(snippet,/target=\\"_self\\"/);
});
